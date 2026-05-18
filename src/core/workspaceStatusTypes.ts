// ---------------------------------------------------------------------------
// workspaceStatusTypes.ts — shared types for the v3 workspace status layer.
// ---------------------------------------------------------------------------
//
// Extracted into a standalone file to prevent a circular import between
// workspaceStatus.ts (which calls suggestedActions.ts) and suggestedActions.ts
// (which operates on the status type). Both modules import from here; neither
// imports from the other's type namespace.
//
// v3.2: SubagentHealthSummary imported from subagentHealth.ts and added as
// a field on WitnessWorkspaceStatus so the Show Workspace Status command can
// render per-entry health details without a second filesystem scan.
//
// v3.3: latestContextPacketHasMandatoryMarkers added to support rule 13 of
// the full suggested-action engine. Computed by reading at most 4096 bytes of
// the latest context packet file in workspaceStatus.ts.
//
// ---------------------------------------------------------------------------

import { SubagentHealthSummary } from './subagentHealth';

// ---------------------------------------------------------------------------
// WitnessSuggestedAction
// ---------------------------------------------------------------------------

/**
 * A single suggested next action derived from the current workspace status.
 *
 * The engine selects exactly one action per status computation. The `commandId`
 * field, when present, is a VS Code command ID that can be executed directly.
 * When absent, the action is informational only.
 */
export interface WitnessSuggestedAction {
  /** Stable identifier for this action type (e.g. `"init-project"`). */
  id: string;

  /** Human-readable label for display in the status bar QuickPick and markdown output. */
  label: string;

  /** One-sentence explanation of why this action is being suggested. */
  reason: string;

  /**
   * VS Code command ID to invoke when the user accepts this suggestion.
   * Omitted when the action is informational only (e.g. `"all-clear"`).
   */
  commandId?: string;

  /** Visual severity for status bar and output formatting. */
  severity: 'info' | 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// WitnessWorkspaceStatus
// ---------------------------------------------------------------------------

/**
 * A point-in-time snapshot of the Witness workspace continuity state.
 *
 * Computed by `computeWorkspaceStatus` in `workspaceStatus.ts` on demand.
 * Not cached between calls in v3.1.
 *
 * All `*AgeMinutes` fields are whole minutes computed from `stat.mtime`.
 * A value of `null` means the corresponding artifact does not exist.
 */
export interface WitnessWorkspaceStatus {
  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------

  /** Whether `.witness/` exists in the workspace root. */
  hasWitness: boolean;

  /**
   * The active session ID read from `.witness/.current-session`, or `null`
   * if no session is active or the file does not exist.
   */
  activeSessionId: string | null;

  // -------------------------------------------------------------------------
  // Source-of-truth artifacts
  // -------------------------------------------------------------------------

  /** Whether `.witness/current-state.md` exists. */
  currentStateExists: boolean;

  /**
   * Age of `.witness/current-state.md` in whole minutes, or `null` if the
   * file does not exist.
   */
  currentStateAgeMinutes: number | null;

  /** Whether `.witness/handovers/latest.md` exists. */
  latestHandoverExists: boolean;

  /**
   * Age of `.witness/handovers/latest.md` in whole minutes, or `null` if the
   * file does not exist.
   */
  latestHandoverAgeMinutes: number | null;

  /**
   * Whether any `*-context-packet-NNN.md` file exists across all sessions.
   * Checked by scanning `.witness/sessions/`.
   */
  latestContextPacketExists: boolean;

  /**
   * Age of the most recently modified context packet file in whole minutes,
   * or `null` if none exists.
   */
  latestContextPacketAgeMinutes: number | null;

  /**
   * Whether the latest context packet file contains unfilled mandatory markers.
   *
   * - `true`  — file exists and at least one of the marker strings was found
   *             in the first 4096 bytes (`{{`, `TODO`, `MANDATORY`, `[MISSING`,
   *             `<fill`).
   * - `false` — file exists and no markers were found in the first 4096 bytes.
   * - `null`  — no context packet exists, or the file could not be read.
   */
  latestContextPacketHasMandatoryMarkers: boolean | null;

  // -------------------------------------------------------------------------
  // Risk
  // -------------------------------------------------------------------------

  /**
   * The overall risk level from the most recently modified risk assessment
   * file (`*-risk-NNN.md`). Extracted from the "Final Overall Level" section
   * of the file content. One of: `GREEN`, `YELLOW`, `ORANGE`, `RED`,
   * `BLOCKED`. `null` if no risk assessment exists or extraction fails.
   */
  latestRiskLevel: string | null;

  /**
   * Age of the most recently modified risk assessment file in whole minutes,
   * or `null` if none exists.
   */
  latestRiskAgeMinutes: number | null;

  // -------------------------------------------------------------------------
  // Subagent health (aggregate counts, v3.1 inline scan)
  // -------------------------------------------------------------------------

  /**
   * Count of v2 ledger entries where `report.md` is present but `review.md`
   * is absent. Orchestrator has not formally closed the loop.
   */
  pendingSubagentReviews: number;

  /**
   * Count of v2 ledger entries where `contract.md` is present but either
   * `report.md` or `review.md` is absent. Includes `pendingSubagentReviews`
   * as a subset.
   */
  incompleteSubagentLedgers: number;

  /**
   * Count of v2 ledger entries whose `report.md` or `review.md` contains a
   * field-level `Status: blocked`, `Status: failed`, or `Decision: rejected`
   * line. Also includes v1 flat `subagent-NNN.md` files whose content matches
   * the same field-level patterns.
   */
  blockedOrFailedSubagents: number;

  // -------------------------------------------------------------------------
  // Telemetry
  // -------------------------------------------------------------------------

  /** Whether `.witness/telemetry/otel/events.jsonl` exists. */
  telemetryEventsExists: boolean;

  /**
   * Count of non-empty lines in `events.jsonl`, or `0` if the file does not
   * exist.
   */
  telemetryEventCount: number;

  // -------------------------------------------------------------------------
  // Subagent health detail (v3.2)
  // -------------------------------------------------------------------------

  /**
   * Full per-entry subagent health summary computed by `computeSubagentHealth`
   * in `subagentHealth.ts`. Includes both v1 flat files and v2 ledger entries.
   *
   * The aggregate count fields on `WitnessWorkspaceStatus`
   * (`pendingSubagentReviews`, `incompleteSubagentLedgers`,
   * `blockedOrFailedSubagents`) are derived from this summary and kept as
   * top-level fields for backward compatibility with `suggestedActions.ts`.
   */
  subagentHealthSummary: SubagentHealthSummary;

  // -------------------------------------------------------------------------
  // Guidance
  // -------------------------------------------------------------------------

  /**
   * The single most relevant suggested next action, selected by
   * `selectSuggestedAction` in `suggestedActions.ts` based on deterministic
   * rules applied to the fields above.
   */
  suggestedAction: WitnessSuggestedAction;
}
