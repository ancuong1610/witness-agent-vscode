// ---------------------------------------------------------------------------
// continuityResolver.ts — Continuity Issue Resolver (v4.1 / v4.4).
// ---------------------------------------------------------------------------
//
// Converts the current WitnessWorkspaceStatus into a developer-friendly
// ContinuityResolutionPlan that answers four questions:
//
//   1. What happened?
//   2. Why does it matter?
//   3. What should I do next?
//   4. What evidence did Witness use?
//
// v4.4: Subagent plan builders now inspect status.subagentHealthSummary.entries
// to identify the top affected entry (lowest ordinal) and produce per-entry
// whatHappened strings, stage-aware primary action routing, and specific file
// artifact paths instead of the generic `.witness/subagents/` directory path.
//
// Design invariants:
//   - resolveTopIssue is synchronous. No filesystem reads. No LLM calls.
//   - Classification uses status.suggestedAction.id only.
//     status.suggestedAction.commandId is never read or forwarded (Q7, locked).
//   - All resolver actions come from the issue-specific action table in this
//     module. No passthrough of WitnessSuggestedAction.commandId.
//   - resolveTopIssue never throws. Unknown issue kinds fall back to all-clear.
//   - No automatic writes. No session switching. No context injection.
//   - No LLM calls. No dashboard. No raw transcript access.
//
// ---------------------------------------------------------------------------

import { WitnessWorkspaceStatus } from './workspaceStatusTypes';
import { SubagentHealthRecord, SubagentHealthLevel } from './subagentHealth';

// ---------------------------------------------------------------------------
// Stale thresholds
// ---------------------------------------------------------------------------

/**
 * Mirrors STALE_CURRENT_STATE_MINUTES in suggestedActions.ts.
 * Keep in sync if that constant changes.
 */
const STALE_CURRENT_STATE_MINUTES = 120;

/**
 * Mirrors STALE_HANDOVER_MINUTES in suggestedActions.ts.
 * Keep in sync if that constant changes.
 */
const STALE_HANDOVER_MINUTES = 180;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ContinuityIssueKind =
  | 'no-witness-project'
  | 'no-active-session'
  | 'blocked-subagent'
  | 'red-risk'
  | 'orange-risk'
  | 'pending-subagent-review'
  | 'loop-risk-subagent'
  | 'incomplete-subagent-ledger'
  | 'stale-current-state'
  | 'missing-current-state'
  | 'missing-context-packet'
  | 'stale-handover'
  | 'context-packet-markers'
  | 'telemetry-not-active'
  | 'all-clear';

export interface ContinuityResolutionAction {
  label: string;
  commandId?: string;
  description: string;
  requiresConfirmation: boolean;
}

export interface ContinuityResolutionPlan {
  issueKind: ContinuityIssueKind;
  title: string;
  whatHappened: string;
  whyItMatters: string;
  whatToDoNext: string;
  evidence: string[];
  severity: 'info' | 'warning' | 'critical';
  primaryAction: ContinuityResolutionAction | null;
  secondaryActions: ContinuityResolutionAction[];
  artifactPaths: string[];
}

// ---------------------------------------------------------------------------
// Issue kind classification
// ---------------------------------------------------------------------------

/**
 * Maps WitnessSuggestedAction.id values to ContinuityIssueKind values.
 *
 * This is the only place in this module that reads the suggested action id.
 * The resolver uses suggestedAction.id for classification only; it does not
 * pass through suggestedAction.commandId. All resolver actions come from the
 * issue-specific plan builders below.
 */
const ISSUE_KIND_MAP: Record<string, ContinuityIssueKind> = {
  'init-project':             'no-witness-project',
  'start-session':            'no-active-session',
  'review-blocked-subagent':  'blocked-subagent',
  'address-red-risk':         'red-risk',
  'review-orange-risk':       'orange-risk',
  'review-subagent':          'pending-subagent-review',
  'check-subagent-loop-risk': 'loop-risk-subagent',
  'check-subagent-progress':  'incomplete-subagent-ledger',
  'refresh-current-state':    'stale-current-state',
  'capture-current-state':    'missing-current-state',
  'create-context-packet':    'missing-context-packet',
  'refresh-handover':         'stale-handover',
  'review-context-packet':    'context-packet-markers',
  'telemetry-not-active':     'telemetry-not-active',
  'all-clear':                'all-clear',
};

function classifyIssueKind(suggestedActionId: string): ContinuityIssueKind {
  return ISSUE_KIND_MAP[suggestedActionId] ?? 'all-clear';
}

// ---------------------------------------------------------------------------
// Shared action constants
// ---------------------------------------------------------------------------

const ACTION_SHOW_STATUS: ContinuityResolutionAction = {
  label: 'Show Workspace Status',
  commandId: 'witness.showWorkspaceStatus',
  description:
    'Open a detailed status summary of all Witness continuity artifacts.',
  requiresConfirmation: false,
};

const ACTION_DO_NOTHING: ContinuityResolutionAction = {
  label: 'Do nothing — mark as seen',
  description: 'Dismiss this resolver. No artifacts will be written.',
  requiresConfirmation: false,
};

/**
 * Returns the standard tail of secondary actions appended to every non-all-clear plan.
 *
 * Pass `omitShowStatus: true` when Show Workspace Status is already the
 * primary action, to avoid surfacing it twice in the QuickPick.
 */
function generalSecondary(omitShowStatus = false): ContinuityResolutionAction[] {
  if (omitShowStatus) {
    return [ACTION_DO_NOTHING];
  }
  return [ACTION_SHOW_STATUS, ACTION_DO_NOTHING];
}

// ---------------------------------------------------------------------------
// Internal: subagent entry helpers (v4.4)
// ---------------------------------------------------------------------------

/**
 * Returns the first SubagentHealthRecord whose healthLevel is in
 * `healthLevels`, searching the entries array in ordinal-ascending order.
 * Returns null if no matching entry exists.
 *
 * Entries are already sorted ascending by ordinal by computeSubagentHealth,
 * so the first match is always the lowest-ordinal affected entry.
 */
function findSubagentEntry(
  status: WitnessWorkspaceStatus,
  healthLevels: SubagentHealthLevel[]
): SubagentHealthRecord | null {
  for (const entry of status.subagentHealthSummary.entries) {
    if ((healthLevels as string[]).includes(entry.healthLevel)) {
      return entry;
    }
  }
  return null;
}

/**
 * Returns true if `stageName` is present in `entry.stagesPresent`.
 */
function hasStage(entry: SubagentHealthRecord, stageName: string): boolean {
  return entry.stagesPresent.includes(stageName);
}

/**
 * Returns true if `stageName` is present in `entry.stagesMissing`.
 */
function missingStage(entry: SubagentHealthRecord, stageName: string): boolean {
  return entry.stagesMissing.includes(stageName);
}

/**
 * Returns a human-readable string of missing stage filenames for use in
 * whatHappened and evidence strings.
 */
function formatMissingStages(entry: SubagentHealthRecord): string {
  return entry.stagesMissing.length > 0
    ? entry.stagesMissing.join(', ')
    : 'none';
}

/**
 * Builds a workspace-relative file path for a stage file within a ledger
 * entry directory.
 *
 * entry.path for ledger entries ends with `/` (e.g. `.witness/subagents/subagent-002/`).
 * This function strips the trailing slash and appends the stage filename.
 */
function ledgerStagePath(entry: SubagentHealthRecord, stageName: string): string {
  return entry.path.replace(/\/$/, '') + '/' + stageName;
}

/**
 * Builds an array of workspace-relative artifact file paths for a subagent
 * entry. Only includes paths for stages that are actually present, so
 * openArtifactPaths is not asked to open non-existent files.
 *
 * For flat entries, returns the entry's own path.
 * For ledger entries, returns paths for each stage in `preferredStages` that
 * appears in entry.stagesPresent.
 */
function buildSubagentArtifactPaths(
  entry: SubagentHealthRecord,
  preferredStages: string[]
): string[] {
  if (entry.format === 'flat') {
    return [entry.path];
  }
  const paths: string[] = [];
  for (const stage of preferredStages) {
    if (hasStage(entry, stage)) {
      paths.push(ledgerStagePath(entry, stage));
    }
  }
  return paths;
}

/**
 * Builds the evidence array for a specific SubagentHealthRecord entry.
 *
 * Includes: entry id, healthLevel, format, path, stagesMissing (if any),
 * stagesPresent (if any), status (if available), reviewDecision (if
 * available), ageMinutes (if available).
 */
function buildSubagentEvidence(entry: SubagentHealthRecord): string[] {
  const evidence: string[] = [
    `entry: ${entry.id}`,
    `healthLevel: ${entry.healthLevel}`,
    `format: ${entry.format}`,
    `path: ${entry.path}`,
  ];
  if (entry.stagesMissing.length > 0) {
    evidence.push(`stagesMissing: ${entry.stagesMissing.join(', ')}`);
  }
  if (entry.stagesPresent.length > 0) {
    evidence.push(`stagesPresent: ${entry.stagesPresent.join(', ')}`);
  }
  if (entry.status !== null) {
    evidence.push(`status: ${entry.status}`);
  }
  if (entry.reviewDecision !== null) {
    evidence.push(`reviewDecision: ${entry.reviewDecision}`);
  }
  if (entry.ageMinutes !== null) {
    evidence.push(`ageMinutes: ${entry.ageMinutes}`);
  }
  return evidence;
}

// ---------------------------------------------------------------------------
// Internal: assertValidPlan
// ---------------------------------------------------------------------------

/**
 * Validates that a plan has all required non-empty string fields.
 *
 * Returns the plan unchanged if valid. Falls back to the all-clear plan if any
 * required text field is empty or evidence is not an array. Does not throw.
 */
function assertValidPlan(plan: ContinuityResolutionPlan): ContinuityResolutionPlan {
  if (
    plan.title.length === 0 ||
    plan.whatHappened.length === 0 ||
    plan.whyItMatters.length === 0 ||
    plan.whatToDoNext.length === 0 ||
    !Array.isArray(plan.evidence)
  ) {
    return buildAllClearPlan();
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Internal: per-issue plan builders
// ---------------------------------------------------------------------------

function buildNoWitnessProjectPlan(): ContinuityResolutionPlan {
  return {
    issueKind: 'no-witness-project',
    title: 'Witness Project Not Initialized',
    whatHappened: 'This workspace does not have a .witness/ directory.',
    whyItMatters:
      'Witness cannot track continuity until the project is initialized.',
    whatToDoNext:
      'Run Witness: Initialize Project to set up the .witness/ structure.',
    evidence: ['.witness/ directory not found'],
    severity: 'warning',
    primaryAction: {
      label: 'Initialize Project',
      commandId: 'witness.initProject',
      description:
        'Create the .witness/ directory and install Witness templates for this workspace.',
      requiresConfirmation: true,
    },
    secondaryActions: generalSecondary(),
    artifactPaths: [],
  };
}

function buildNoActiveSessionPlan(): ContinuityResolutionPlan {
  return {
    issueKind: 'no-active-session',
    title: 'No Active Session',
    whatHappened: 'No session is currently active.',
    whyItMatters:
      'Most Witness commands require an active session to associate artifacts with a session ID.',
    whatToDoNext:
      'Run Witness: Start Session to begin a session, or Witness: Resume Session if you are continuing prior work.',
    evidence: ['activeSessionId: none'],
    severity: 'warning',
    primaryAction: {
      label: 'Start Session',
      commandId: 'witness.startSession',
      description: 'Create a new session and set it as active.',
      requiresConfirmation: true,
    },
    secondaryActions: [
      {
        label: 'Resume Session',
        commandId: 'witness.resumeSession',
        description: 'Resume a prior session from its context packet.',
        requiresConfirmation: true,
      },
      ...generalSecondary(),
    ],
    artifactPaths: [],
  };
}

function buildBlockedSubagentPlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const count = status.blockedOrFailedSubagents;
  const entry = findSubagentEntry(status, ['blocked']);

  let whatHappened: string;
  let evidence: string[];
  let artifactPaths: string[];

  if (entry !== null) {
    whatHappened = `${entry.id} is blocked or failed.`;
    evidence = buildSubagentEvidence(entry);
    artifactPaths = buildSubagentArtifactPaths(
      entry,
      ['evidence.md', 'report.md', 'review.md', 'contract.md']
    );
  } else {
    whatHappened = `${count} subagent${count === 1 ? '' : 's'} reported a blocked or failed status.`;
    const loopCount = status.subagentHealthSummary.loopRiskCount;
    evidence = [`blockedOrFailedSubagents: ${count}`];
    if (loopCount > 0) {
      evidence.push(`subagentHealthSummary.loopRiskCount: ${loopCount}`);
    }
    artifactPaths = [];
  }

  return {
    issueKind: 'blocked-subagent',
    title: 'Subagent Blocked or Failed',
    whatHappened,
    whyItMatters:
      'A blocked subagent means delegated work has stopped. The task outcome is unknown until you review the report and decide whether to retry, close, or re-delegate.',
    whatToDoNext:
      'Open the blocked subagent report or evidence file, review what it found, and decide how to proceed.',
    evidence,
    severity: 'critical',
    primaryAction: {
      label: 'Review Blocked Subagent',
      commandId: 'witness.reviewSubagentTask',
      description:
        'Open the subagent review workflow to record a decision for the blocked task.',
      requiresConfirmation: true,
    },
    secondaryActions: generalSecondary(),
    artifactPaths,
  };
}

function buildRedRiskPlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const riskLevel = status.latestRiskLevel ?? 'RED';
  const handoverAge = status.latestHandoverAgeMinutes;
  const evidence: string[] = [
    `latestRiskLevel: ${riskLevel}`,
    handoverAge === null
      ? 'latestHandoverExists: false'
      : `latestHandoverAgeMinutes: ${handoverAge}`,
  ];
  const handoverDescription =
    handoverAge === null
      ? 'absent'
      : `${handoverAge} minutes old (threshold: ${STALE_HANDOVER_MINUTES} minutes)`;
  return {
    issueKind: 'red-risk',
    title: 'Red Continuity Risk — Handover Needed',
    whatHappened: `The latest risk assessment is ${riskLevel} and your handover is ${handoverDescription}.`,
    whyItMatters:
      'A RED risk without a fresh handover means the project continuity record does not reflect the current state of risk. If you switch sessions now, the next session starts with an incomplete picture.',
    whatToDoNext:
      'Generate a fresh handover that captures the current state and the active risk. Then validate it and create a context packet.',
    evidence,
    severity: 'critical',
    primaryAction: {
      label: 'Generate Handover',
      commandId: 'witness.generateHandover',
      description:
        'Write a new handover document capturing the current session state and risk level.',
      requiresConfirmation: true,
    },
    secondaryActions: [
      {
        label: 'Prepare Session Switch',
        commandId: 'witness.prepareSessionSwitch',
        description:
          'Run the full guided session switch workflow: handover, validation, resume probe, context packet.',
        requiresConfirmation: true,
      },
      {
        label: 'Assess Continuity Risk',
        commandId: 'witness.assessRisk',
        description:
          'Re-run the risk assessment to check whether the risk level has changed.',
        requiresConfirmation: true,
      },
      ...generalSecondary(),
    ],
    artifactPaths: ['.witness/handovers/latest.md'],
  };
}

function buildOrangeRiskPlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const handoverAge = status.latestHandoverAgeMinutes;
  const evidence: string[] = [
    'latestRiskLevel: ORANGE',
    handoverAge === null
      ? 'latestHandoverExists: false'
      : `latestHandoverAgeMinutes: ${handoverAge}`,
  ];
  const handoverDescription =
    handoverAge === null
      ? 'absent'
      : `${handoverAge} minutes old (threshold: ${STALE_HANDOVER_MINUTES} minutes)`;
  return {
    issueKind: 'orange-risk',
    title: 'Orange Continuity Risk',
    whatHappened: `The latest risk assessment is ORANGE and your handover is ${handoverDescription}.`,
    whyItMatters:
      'An ORANGE risk indicates an elevated but not critical continuity gap. A fresh handover is recommended before further session work.',
    whatToDoNext:
      'Review the risk assessment and generate a handover if you are approaching a session transition.',
    evidence,
    severity: 'warning',
    primaryAction: {
      label: 'Generate Handover',
      commandId: 'witness.generateHandover',
      description: 'Write a new handover document capturing the current session state.',
      requiresConfirmation: true,
    },
    secondaryActions: [
      {
        label: 'Assess Continuity Risk',
        commandId: 'witness.assessRisk',
        description:
          'Re-run the risk assessment to check if the risk level has changed.',
        requiresConfirmation: true,
      },
      ...generalSecondary(),
    ],
    artifactPaths: ['.witness/handovers/latest.md'],
  };
}

function buildPendingSubagentReviewPlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const count = status.pendingSubagentReviews;
  const entry = findSubagentEntry(status, ['needs-review']);

  let whatHappened: string;
  let whatToDoNext: string;
  let evidence: string[];
  let artifactPaths: string[];

  if (entry !== null) {
    whatHappened = `${entry.id} has a completion report but no review decision.`;
    whatToDoNext =
      'Open the report and evidence, then run Witness: Review Subagent Task.';
    evidence = buildSubagentEvidence(entry);
    // report.md is always present for needs-review; include evidence and contract if present.
    artifactPaths = buildSubagentArtifactPaths(
      entry,
      ['report.md', 'evidence.md', 'contract.md']
    );
  } else {
    whatHappened = `${count} subagent task${count === 1 ? '' : 's'} ${count === 1 ? 'has' : 'have'} a completion report but no review decision.`;
    whatToDoNext =
      'Open the subagent evidence and report files, review the task outcome, and record your review decision.';
    evidence = [`pendingSubagentReviews: ${count}`];
    artifactPaths = [];
  }

  return {
    issueKind: 'pending-subagent-review',
    title: 'Subagent Task Needs Review',
    whatHappened,
    whyItMatters:
      'Unreviewed subagent tasks mean the orchestrator loop is open. The work exists but has not been accepted, rejected, or flagged for follow-up.',
    whatToDoNext,
    evidence,
    severity: 'warning',
    primaryAction: {
      label: 'Review Subagent Task',
      commandId: 'witness.reviewSubagentTask',
      description:
        'Open the subagent review workflow to record an accept, reject, or follow-up decision.',
      requiresConfirmation: true,
    },
    secondaryActions: generalSecondary(),
    artifactPaths,
  };
}

function buildLoopRiskSubagentPlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const count = status.subagentHealthSummary.loopRiskCount;
  const entry = findSubagentEntry(status, ['loop-risk']);

  let whatHappened: string;
  let evidence: string[];
  let artifactPaths: string[];

  if (entry !== null) {
    whatHappened = `${entry.id} has evidence but no completion report after the loop-risk threshold.`;
    evidence = buildSubagentEvidence(entry);
    artifactPaths = buildSubagentArtifactPaths(
      entry,
      ['evidence.md', 'contract.md', 'context-packet.md']
    );
  } else {
    whatHappened = `${count} subagent${count === 1 ? '' : 's'} ${count === 1 ? 'has' : 'have'} evidence files that are stale with no completion report.`;
    evidence = [`subagentHealthSummary.loopRiskCount: ${count}`];
    artifactPaths = [];
  }

  return {
    issueKind: 'loop-risk-subagent',
    title: 'Subagent May Be Looping or Stalled',
    whatHappened,
    whyItMatters:
      'A subagent that produces evidence but no report may have stalled, looped, or exited silently. This leaves the orchestrator loop open without a clear outcome.',
    whatToDoNext:
      'Review the evidence file to understand what the subagent produced, then decide whether to close the task, retry, or re-delegate.',
    evidence,
    severity: 'warning',
    primaryAction: {
      label: 'Show Workspace Status',
      commandId: 'witness.showWorkspaceStatus',
      description:
        'Open a detailed status view showing per-entry subagent health and which stage files are missing.',
      requiresConfirmation: false,
    },
    secondaryActions: [
      {
        label: 'Complete Subagent Task',
        commandId: 'witness.completeSubagentTask',
        description:
          'Write the completion report for a subagent task that has finished but not been formally closed.',
        requiresConfirmation: true,
      },
      {
        label: 'Record Subagent Evidence',
        commandId: 'witness.recordSubagentEvidence',
        description:
          'Record observed evidence for a subagent task that is still in progress.',
        requiresConfirmation: true,
      },
      ACTION_DO_NOTHING,
    ],
    artifactPaths,
  };
}

function buildIncompleteSubagentLedgerPlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const count = status.incompleteSubagentLedgers;

  // Prefer an 'incomplete' entry; fall back to 'loop-risk' if none exists.
  // Flat entries cannot have these health levels, so this will always find a
  // ledger entry or null.
  const entry =
    findSubagentEntry(status, ['incomplete']) ??
    findSubagentEntry(status, ['loop-risk']);

  // ---------------------------------------------------------------------------
  // Per-entry stage-aware routing (v4.4 main improvement).
  //
  // When a ledger entry is available, use stagesMissing to select the most
  // specific primary action rather than always falling back to Show Workspace
  // Status. The developer sees exactly which command to run next.
  // ---------------------------------------------------------------------------

  if (entry !== null && entry.format === 'ledger') {
    const missingEvidence = missingStage(entry, 'evidence.md');
    const missingReport   = missingStage(entry, 'report.md');
    const missingReview   = missingStage(entry, 'review.md');
    const missingStagesStr = formatMissingStages(entry);

    // Determine the next required stage command.
    let primaryLabel: string;
    let primaryCommandId: string;
    let primaryDescription: string;
    let whatToDoNext: string;

    if (missingEvidence) {
      primaryLabel       = 'Record Subagent Evidence';
      primaryCommandId   = 'witness.recordSubagentEvidence';
      primaryDescription = `Record observed evidence for ${entry.id} — evidence.md is the next required stage.`;
      whatToDoNext       = `Open ${entry.id} and run Witness: Record Subagent Evidence — evidence.md is missing.`;
    } else if (missingReport) {
      primaryLabel       = 'Complete Subagent Task';
      primaryCommandId   = 'witness.completeSubagentTask';
      primaryDescription = `Write the completion report for ${entry.id} — evidence.md exists but report.md is missing.`;
      whatToDoNext       = `Open ${entry.id} and run Witness: Complete Subagent Task — evidence.md exists but report.md is missing.`;
    } else if (missingReview) {
      primaryLabel       = 'Review Subagent Task';
      primaryCommandId   = 'witness.reviewSubagentTask';
      primaryDescription = `Record a review decision for ${entry.id} — report.md exists but review.md is missing.`;
      whatToDoNext       = `Open ${entry.id} and run Witness: Review Subagent Task — report.md exists but review.md is missing.`;
    } else {
      // All stage files present but entry was not healthy — defer to status view.
      primaryLabel       = 'Show Workspace Status';
      primaryCommandId   = 'witness.showWorkspaceStatus';
      primaryDescription = 'Open a detailed status view to investigate why this entry is not marked healthy.';
      whatToDoNext       = `${entry.id} has all stage files but was not classified as healthy. Run Show Workspace Status for details.`;
    }

    return {
      issueKind: 'incomplete-subagent-ledger',
      title: 'Subagent Task Not Completed',
      whatHappened: `${entry.id} is incomplete. Missing stages: ${missingStagesStr}.`,
      whyItMatters:
        'A task was dispatched but has not been formally completed. The outcome is unknown to the orchestrator and the orchestrator loop remains open.',
      whatToDoNext,
      evidence: buildSubagentEvidence(entry),
      severity: 'warning',
      primaryAction: {
        label: primaryLabel,
        commandId: primaryCommandId,
        description: primaryDescription,
        requiresConfirmation: true,
      },
      secondaryActions: [ACTION_SHOW_STATUS, ACTION_DO_NOTHING],
      artifactPaths: buildSubagentArtifactPaths(
        entry,
        ['contract.md', 'context-packet.md', 'evidence.md', 'report.md']
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // Aggregate fallback — no usable ledger entry found.
  // ---------------------------------------------------------------------------

  return {
    issueKind: 'incomplete-subagent-ledger',
    title: 'Subagent Task Not Completed',
    whatHappened:
      `${count} subagent ledger${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} incomplete` +
      ' — a contract exists but one or more required stage files are missing.',
    whyItMatters:
      'A task was dispatched but has not been formally completed. The outcome is unknown to the orchestrator and the orchestrator loop remains open.',
    whatToDoNext:
      'Open the ledger entry and check which stage files are present. ' +
      'If evidence.md is absent, run Witness: Record Subagent Evidence. ' +
      'If evidence.md exists but report.md is absent, run Witness: Complete Subagent Task. ' +
      'If report.md exists but review.md is absent, run Witness: Review Subagent Task. ' +
      'Run Show Workspace Status to see the per-entry health breakdown.',
    evidence: [`incompleteSubagentLedgers: ${count}`],
    severity: 'warning',
    primaryAction: {
      label: 'Show Workspace Status',
      commandId: 'witness.showWorkspaceStatus',
      description:
        'Open a detailed status view showing per-entry subagent health and which stage files are missing.',
      requiresConfirmation: false,
    },
    secondaryActions: [
      {
        label: 'Record Subagent Evidence',
        commandId: 'witness.recordSubagentEvidence',
        description:
          'Record observed evidence for a subagent task (use when evidence.md is missing).',
        requiresConfirmation: true,
      },
      {
        label: 'Complete Subagent Task',
        commandId: 'witness.completeSubagentTask',
        description:
          'Write the completion report for a subagent task (use when evidence.md exists but report.md is missing).',
        requiresConfirmation: true,
      },
      {
        label: 'Review Subagent Task',
        commandId: 'witness.reviewSubagentTask',
        description:
          'Record a review decision for a subagent task (use when report.md exists but review.md is missing).',
        requiresConfirmation: true,
      },
      ACTION_DO_NOTHING,
    ],
    artifactPaths: [],
  };
}

function buildStaleCurrentStatePlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const age = status.currentStateAgeMinutes ?? 0;
  return {
    issueKind: 'stale-current-state',
    title: 'Current State Is Stale — Checkpoint Recommended',
    whatHappened: `current-state.md has not been updated in ${age} minutes (threshold: ${STALE_CURRENT_STATE_MINUTES} minutes).`,
    whyItMatters:
      'The current state file is the primary record of where the project stands. A stale file means the next session resume or handover generation will start from an outdated snapshot.',
    whatToDoNext:
      'Run Witness: Compress Current State to archive the current snapshot to a dated session file and open current-state.md for manual trimming and refresh.',
    evidence: [
      `currentStateAgeMinutes: ${age}`,
      `staleThresholdMinutes: ${STALE_CURRENT_STATE_MINUTES}`,
    ],
    severity: 'warning',
    primaryAction: {
      label: 'Compress Current State',
      commandId: 'witness.compressState',
      description:
        'Archive current-state.md to a dated session snapshot and open it for manual trimming and refresh.',
      requiresConfirmation: true,
    },
    secondaryActions: generalSecondary(),
    artifactPaths: ['.witness/current-state.md'],
  };
}

function buildMissingCurrentStatePlan(): ContinuityResolutionPlan {
  return {
    issueKind: 'missing-current-state',
    title: 'No Current State File',
    whatHappened: 'current-state.md does not exist in this workspace.',
    whyItMatters:
      "Without a current state file, there is no written record of the project's present position. Session handovers and context packets depend on this file.",
    whatToDoNext:
      'Check .witness/sessions/ for a prior session snapshot (e.g. <session-id>-current-state-NNN.md) and restore its content manually. ' +
      'If no prior snapshot exists, run Witness: Initialize Project — this restores the current-state.md template without overwriting other artifacts, but should be used carefully as it re-runs initialization logic.',
    evidence: ['.witness/current-state.md missing'],
    severity: 'warning',
    // Do not use witness.compressState here: compressState requires the file to
    // exist and will fail immediately when current-state.md is absent (Q7, locked).
    primaryAction: {
      label: 'Show Workspace Status',
      commandId: 'witness.showWorkspaceStatus',
      description:
        'Open a detailed status summary to review artifact state before deciding how to restore current-state.md.',
      requiresConfirmation: false,
    },
    secondaryActions: [
      {
        label: 'Initialize Project',
        commandId: 'witness.initProject',
        description:
          'Restore the current-state.md template by re-running initialization. Use carefully — this re-runs initialization logic.',
        requiresConfirmation: true,
      },
      ACTION_DO_NOTHING,
    ],
    artifactPaths: [],
  };
}

function buildMissingContextPacketPlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const evidence: string[] = [
    `latestHandoverExists: ${status.latestHandoverExists}`,
    'latestContextPacketExists: false',
  ];
  return {
    issueKind: 'missing-context-packet',
    title: 'No Context Packet for This Session',
    whatHappened:
      'A handover exists but no context packet has been created for this session.',
    whyItMatters:
      'A context packet assembles the handover, current state, and open threads into a single file for session resume. Without it, resuming this session requires manually locating multiple artifacts.',
    whatToDoNext:
      'Run Witness: Create Context Packet to assemble the resume artifact.',
    evidence,
    severity: 'info',
    primaryAction: {
      label: 'Create Context Packet',
      commandId: 'witness.createContextPacket',
      description:
        'Assemble the handover, current state, and open threads into a single context packet file.',
      requiresConfirmation: true,
    },
    secondaryActions: generalSecondary(),
    artifactPaths: ['.witness/handovers/latest.md'],
  };
}

function buildStaleHandoverPlan(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const age = status.latestHandoverAgeMinutes ?? 0;
  return {
    issueKind: 'stale-handover',
    title: 'Handover Is Stale',
    whatHappened: `handovers/latest.md has not been updated in ${age} minutes (threshold: ${STALE_HANDOVER_MINUTES} minutes).`,
    whyItMatters:
      'A stale handover means the continuity record does not reflect recent progress. If the session ends now, the next session starts from an outdated record.',
    whatToDoNext:
      'Run Witness: Generate Handover to refresh the handover with the current session state.',
    evidence: [
      `latestHandoverAgeMinutes: ${age}`,
      `staleThresholdMinutes: ${STALE_HANDOVER_MINUTES}`,
    ],
    severity: 'warning',
    primaryAction: {
      label: 'Generate Handover',
      commandId: 'witness.generateHandover',
      description:
        'Write a new handover document capturing the current session state.',
      requiresConfirmation: true,
    },
    secondaryActions: generalSecondary(),
    artifactPaths: ['.witness/handovers/latest.md'],
  };
}

function buildContextPacketMarkersPlan(): ContinuityResolutionPlan {
  return {
    issueKind: 'context-packet-markers',
    title: 'Context Packet Has Unfilled Placeholders',
    whatHappened:
      'The most recent context packet contains mandatory placeholder markers ({{, TODO, MANDATORY, [MISSING, or <fill).',
    whyItMatters:
      'An unfilled context packet will confuse or mislead a coding agent that tries to use it for session resume. Placeholders signal that the packet was generated but not completed.',
    whatToDoNext:
      'Open the context packet file, fill in the marked sections, and save.',
    evidence: ['latestContextPacketHasMandatoryMarkers: true'],
    severity: 'warning',
    primaryAction: null,
    secondaryActions: [
      {
        label: 'Create Context Packet',
        commandId: 'witness.createContextPacket',
        description:
          'Regenerate the context packet from scratch. Note: this will overwrite the current packet.',
        requiresConfirmation: true,
      },
      ACTION_SHOW_STATUS,
      ACTION_DO_NOTHING,
    ],
    // v4.1: the exact context packet file path is not available from the
    // WitnessWorkspaceStatus aggregate. Artifact path routing by exact file
    // name is deferred to v4.4.
    artifactPaths: [],
  };
}

function buildTelemetryNotActivePlan(): ContinuityResolutionPlan {
  return {
    issueKind: 'telemetry-not-active',
    title: 'Telemetry Not Active',
    whatHappened:
      'No telemetry events file was found in .witness/telemetry/.',
    whyItMatters:
      'Telemetry events are used by the Evaluation Summary command and by the workspace status scanner. Without them, session-level reporting is unavailable.',
    whatToDoNext:
      'Run any Witness command — telemetry is initialized automatically on first write. ' +
      'If telemetry is missing after commands have been run, check that .witness/telemetry/ exists and is writable.',
    evidence: ['telemetryEventsExists: false'],
    severity: 'info',
    primaryAction: {
      label: 'Show Workspace Status',
      commandId: 'witness.showWorkspaceStatus',
      description:
        'Open the workspace status view to re-check telemetry state after running a Witness command.',
      requiresConfirmation: false,
    },
    secondaryActions: [ACTION_DO_NOTHING],
    artifactPaths: [],
  };
}

function buildAllClearPlan(): ContinuityResolutionPlan {
  return {
    issueKind: 'all-clear',
    title: 'No Continuity Issues Found',
    whatHappened:
      'All continuity artifacts are present and within acceptable age thresholds.',
    whyItMatters: 'Workspace continuity is healthy.',
    whatToDoNext:
      'Continue your session normally. Witness will alert you if anything changes.',
    evidence: [],
    severity: 'info',
    primaryAction: null,
    secondaryActions: [],
    artifactPaths: [],
  };
}

// ---------------------------------------------------------------------------
// Internal: plan dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatches to the correct plan builder for the given issue kind.
 *
 * Each builder receives the full status record so it can extract field values
 * for evidence strings and parameterized descriptions.
 *
 * The switch is exhaustive over ContinuityIssueKind. TypeScript will flag any
 * future issue kind that is added to the union without a corresponding case.
 */
function buildPlan(
  issueKind: ContinuityIssueKind,
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  switch (issueKind) {
    case 'no-witness-project':
      return buildNoWitnessProjectPlan();
    case 'no-active-session':
      return buildNoActiveSessionPlan();
    case 'blocked-subagent':
      return buildBlockedSubagentPlan(status);
    case 'red-risk':
      return buildRedRiskPlan(status);
    case 'orange-risk':
      return buildOrangeRiskPlan(status);
    case 'pending-subagent-review':
      return buildPendingSubagentReviewPlan(status);
    case 'loop-risk-subagent':
      return buildLoopRiskSubagentPlan(status);
    case 'incomplete-subagent-ledger':
      return buildIncompleteSubagentLedgerPlan(status);
    case 'stale-current-state':
      return buildStaleCurrentStatePlan(status);
    case 'missing-current-state':
      return buildMissingCurrentStatePlan();
    case 'missing-context-packet':
      return buildMissingContextPacketPlan(status);
    case 'stale-handover':
      return buildStaleHandoverPlan(status);
    case 'context-packet-markers':
      return buildContextPacketMarkersPlan();
    case 'telemetry-not-active':
      return buildTelemetryNotActivePlan();
    case 'all-clear':
      return buildAllClearPlan();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts the current WitnessWorkspaceStatus into a ContinuityResolutionPlan
 * for the top-priority issue.
 *
 * Classification:
 *   - Uses status.suggestedAction.id to identify the issue kind.
 *   - Does NOT use status.suggestedAction.commandId. All resolver actions come
 *     from the issue-specific action table in this module (Q7, locked v4.1).
 *   - Unknown suggestedAction.id values fall back to all-clear.
 *
 * This function is synchronous and stateless. It performs no filesystem reads
 * and makes no LLM calls.
 *
 * @param status - The computed workspace status record.
 * @returns A fully populated ContinuityResolutionPlan.
 */
export function resolveTopIssue(
  status: WitnessWorkspaceStatus
): ContinuityResolutionPlan {
  const issueKind = classifyIssueKind(status.suggestedAction.id);
  const plan = buildPlan(issueKind, status);
  return assertValidPlan(plan);
}
