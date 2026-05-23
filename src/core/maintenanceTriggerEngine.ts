// ---------------------------------------------------------------------------
// maintenanceTriggerEngine.ts — v6.1 Maintenance Trigger Engine
// ---------------------------------------------------------------------------
//
// Computes the single most relevant Witness maintenance need from the current
// workspace status and optional observed project facts.
//
// Design constraints:
//   - Pure function: input → output, no side effects.
//   - No filesystem reads or writes.
//   - No git calls.
//   - No VS Code API usage.
//   - No LLM calls.
//   - No telemetry.
//   - Synchronous.
//
// The caller is responsible for supplying all observed facts (dirty workspace,
// changed file count, checkpoint age). This module only evaluates rules.
//
// v6.1: Initial implementation. 11 rules evaluated in priority order.
//       First matching rule wins.
//
// ---------------------------------------------------------------------------

import { WitnessWorkspaceStatus } from './workspaceStatusTypes';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type MaintenanceNeedKind =
  | "none"
  | "update-current-state"
  | "create-checkpoint"
  | "prepare-handover"
  | "review-subagent-artifacts"
  | "resume-with-witness";

export type MaintenanceSeverity = "info" | "warning" | "critical";

/**
 * A single maintenance need returned by the trigger engine.
 *
 * `kind` is the primary discriminant. `title` and `reason` are human-readable
 * strings for display in the status bar or notification. `severity` controls
 * how prominently the need is surfaced. `evidence` is a list of short
 * key: value strings that explain why this need was selected. `recommendedCommandId`
 * is the VS Code command the developer should run to address the need.
 */
export interface MaintenanceNeed {
  kind: MaintenanceNeedKind;
  title: string;
  reason: string;
  severity: MaintenanceSeverity;
  evidence: string[];
  recommendedCommandId?: string;
}

/**
 * Inputs to the maintenance trigger engine.
 *
 * `status` is the full workspace status from `computeWorkspaceStatus`.
 * The remaining fields are optional observed facts that the caller may
 * supply from git observation or other workspace signals. When absent,
 * the corresponding rules fall back to the information available in `status`.
 */
export interface MaintenanceTriggerInput {
  /** Full workspace status snapshot. */
  status: WitnessWorkspaceStatus;

  /**
   * Whether the working tree contains uncommitted changes to source files.
   * Supplied by the caller from git observation when available.
   * When absent, rules that depend on this fact are skipped or use a
   * conservative default.
   */
  dirtyWorkspace?: boolean;

  /**
   * Number of source files changed since the last checkpoint or current-state
   * update, as reported by git or workspace observation. Null or absent means
   * the count is unavailable.
   */
  changedFileCount?: number | null;

  /**
   * Age of the most recently created checkpoint file in whole minutes.
   * Null or absent means no checkpoint exists or the age is unavailable.
   */
  latestCheckpointAgeMinutes?: number | null;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** current-state.md age above which a stale-state need is raised (minutes). */
const CURRENT_STATE_STALE_MINUTES = 120;

/** Latest handover age above which a refresh need is raised (minutes). */
const HANDOVER_STALE_MINUTES = 180;

/** Checkpoint age above which a new checkpoint is recommended (minutes). */
const CHECKPOINT_STALE_MINUTES = 60;

/** Minimum number of changed files before a dirty-workspace checkpoint is recommended. */
const DIRTY_FILE_COUNT_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the evidence array from all observable input facts.
 * Always includes the core status fields so callers can reconstruct what
 * was visible at decision time. Additional fields are included only when
 * their values are non-null and non-undefined.
 */
function buildEvidence(input: MaintenanceTriggerInput): string[] {
  const { status, dirtyWorkspace, changedFileCount, latestCheckpointAgeMinutes } = input;
  const ev: string[] = [];

  ev.push(`hasWitness: ${status.hasWitness}`);

  if (status.activeSessionId !== null && status.activeSessionId !== undefined) {
    ev.push(`activeSessionId: ${status.activeSessionId}`);
  } else {
    ev.push(`activeSessionId: none`);
  }

  if (status.currentStateExists) {
    ev.push(`currentStateAgeMinutes: ${status.currentStateAgeMinutes ?? "unknown"}`);
  } else {
    ev.push(`currentStateExists: false`);
  }

  if (status.latestRiskLevel !== null && status.latestRiskLevel !== undefined) {
    ev.push(`latestRiskLevel: ${status.latestRiskLevel}`);
  }

  if (status.pendingSubagentReviews > 0) {
    ev.push(`pendingSubagentReviews: ${status.pendingSubagentReviews}`);
  }

  if (status.blockedOrFailedSubagents > 0) {
    ev.push(`blockedOrFailedSubagents: ${status.blockedOrFailedSubagents}`);
  }

  if (status.latestHandoverExists) {
    ev.push(`latestHandoverAgeMinutes: ${status.latestHandoverAgeMinutes ?? "unknown"}`);
  } else {
    ev.push(`latestHandoverExists: false`);
  }

  if (dirtyWorkspace !== undefined && dirtyWorkspace !== null) {
    ev.push(`dirtyWorkspace: ${dirtyWorkspace}`);
  }

  if (changedFileCount !== undefined && changedFileCount !== null) {
    ev.push(`changedFileCount: ${changedFileCount}`);
  }

  if (latestCheckpointAgeMinutes !== undefined && latestCheckpointAgeMinutes !== null) {
    ev.push(`latestCheckpointAgeMinutes: ${latestCheckpointAgeMinutes}`);
  } else if (latestCheckpointAgeMinutes === null) {
    ev.push(`latestCheckpointAgeMinutes: unknown`);
  }

  return ev;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Compute the single most relevant Witness maintenance need.
 *
 * Rules are evaluated in priority order. The first matching rule wins.
 * When no rule matches, kind "none" is returned.
 *
 * This function is pure: same input always produces the same output.
 * It performs no I/O, makes no LLM calls, and emits no telemetry.
 */
export function computeMaintenanceNeed(input: MaintenanceTriggerInput): MaintenanceNeed {
  const { status, dirtyWorkspace, changedFileCount, latestCheckpointAgeMinutes } = input;
  const evidence = buildEvidence(input);

  // -------------------------------------------------------------------------
  // Rule 1 — Witness not enabled
  // -------------------------------------------------------------------------
  if (!status.hasWitness) {
    return {
      kind: "none",
      title: "Witness is not enabled",
      reason: "This workspace is not initialized for Witness.",
      severity: "info",
      evidence,
      recommendedCommandId: "witness.enableProject",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 2 — No active session
  // -------------------------------------------------------------------------
  if (!status.activeSessionId) {
    return {
      kind: "resume-with-witness",
      title: "Start tracking or resume with Witness",
      reason: "No active Witness session is present.",
      severity: "info",
      evidence,
      recommendedCommandId: "witness.startTrackingTask",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 3 — Blocked/failed subagents or pending subagent reviews
  // -------------------------------------------------------------------------
  if (status.blockedOrFailedSubagents > 0 || status.pendingSubagentReviews > 0) {
    const severity: MaintenanceSeverity =
      status.blockedOrFailedSubagents > 0 ? "critical" : "warning";
    return {
      kind: "review-subagent-artifacts",
      title: "Review subagent artifacts",
      reason: "Subagent work needs human review before it should be trusted.",
      severity,
      evidence,
      recommendedCommandId: "witness.resolveContinuityIssue",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 4 — Risk level RED or BLOCKED
  // -------------------------------------------------------------------------
  const riskLevel = status.latestRiskLevel?.toUpperCase() ?? null;
  if (riskLevel === "RED" || riskLevel === "BLOCKED") {
    return {
      kind: "prepare-handover",
      title: "Prepare handover",
      reason:
        "Continuity risk is high and should be preserved before more work continues.",
      severity: "critical",
      evidence,
      recommendedCommandId: "witness.prepareSessionSwitch",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 5 — Risk level ORANGE
  // -------------------------------------------------------------------------
  if (riskLevel === "ORANGE") {
    return {
      kind: "prepare-handover",
      title: "Prepare handover",
      reason:
        "Continuity risk is elevated; prepare a handover before continuing much further.",
      severity: "warning",
      evidence,
      recommendedCommandId: "witness.prepareSessionSwitch",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 6 — Stale current-state (exists but old)
  // -------------------------------------------------------------------------
  if (
    status.currentStateExists &&
    status.currentStateAgeMinutes !== null &&
    status.currentStateAgeMinutes > CURRENT_STATE_STALE_MINUTES
  ) {
    return {
      kind: "update-current-state",
      title: "Update project memory",
      reason: `current-state.md is stale (${status.currentStateAgeMinutes} minutes old).`,
      severity: "warning",
      evidence,
      recommendedCommandId: "witness.createCheckpoint",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 7 — Missing current-state
  // -------------------------------------------------------------------------
  if (!status.currentStateExists) {
    return {
      kind: "update-current-state",
      title: "Project memory is missing",
      reason: "current-state.md is missing.",
      severity: "warning",
      evidence,
      recommendedCommandId: "witness.showWorkspaceStatus",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 8 — Dirty workspace with enough changed files and no recent checkpoint
  // -------------------------------------------------------------------------
  const checkpointOldOrMissing =
    latestCheckpointAgeMinutes === null ||
    latestCheckpointAgeMinutes === undefined ||
    latestCheckpointAgeMinutes > CHECKPOINT_STALE_MINUTES;

  if (
    dirtyWorkspace === true &&
    changedFileCount !== null &&
    changedFileCount !== undefined &&
    changedFileCount >= DIRTY_FILE_COUNT_THRESHOLD &&
    checkpointOldOrMissing
  ) {
    return {
      kind: "create-checkpoint",
      title: "Create checkpoint",
      reason: `Several files changed and no recent checkpoint was detected.`,
      severity: "warning",
      evidence,
      recommendedCommandId: "witness.createCheckpoint",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 9 — Stale handover (exists but old)
  // -------------------------------------------------------------------------
  if (
    status.latestHandoverExists &&
    status.latestHandoverAgeMinutes !== null &&
    status.latestHandoverAgeMinutes > HANDOVER_STALE_MINUTES
  ) {
    return {
      kind: "prepare-handover",
      title: "Refresh handover",
      reason: `The latest handover is stale (${status.latestHandoverAgeMinutes} minutes old).`,
      severity: "warning",
      evidence,
      recommendedCommandId: "witness.prepareSessionSwitch",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 10 — No handover, active session exists
  // -------------------------------------------------------------------------
  if (!status.latestHandoverExists && status.activeSessionId) {
    return {
      kind: "prepare-handover",
      title: "Prepare handover",
      reason: "No latest handover exists for this active work.",
      severity: "info",
      evidence,
      recommendedCommandId: "witness.prepareSessionSwitch",
    };
  }

  // -------------------------------------------------------------------------
  // Rule 11 — All clear
  // -------------------------------------------------------------------------
  return {
    kind: "none",
    title: "Witness maintenance is up to date",
    reason: "No immediate maintenance need was detected.",
    severity: "info",
    evidence,
    recommendedCommandId: undefined,
  };
}
