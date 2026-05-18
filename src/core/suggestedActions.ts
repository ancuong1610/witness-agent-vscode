// ---------------------------------------------------------------------------
// suggestedActions.ts — deterministic suggested-action engine (v3.3).
// ---------------------------------------------------------------------------
//
// Selects a single WitnessSuggestedAction from the current workspace status
// using a fixed priority list of predicate rules. No LLM inference. No
// filesystem reads. Pure function over the status record.
//
// v3.3 replaces the v3.1 5-rule stub with the full 15-rule engine.
//
// Rule evaluation order:
//   1.  No .witness/ directory
//   2.  No active session
//   3.  Blocked or failed subagent exists
//   4.  RED or BLOCKED risk level and handover absent or stale
//   5.  ORANGE risk level and handover absent or stale
//   6.  Pending subagent reviews
//   7.  Loop-risk subagents
//   8.  Incomplete subagent ledgers
//   9.  Current-state stale (> 120 min)
//  10.  Current-state missing
//  11.  Latest handover exists but no context packet assembled
//  12.  Latest handover stale (> 180 min)
//  13.  Context packet may need review (mandatory markers present)
//  14.  Telemetry not active
//  15.  Default: all-clear
//
// ---------------------------------------------------------------------------

import { WitnessWorkspaceStatus, WitnessSuggestedAction } from './workspaceStatusTypes';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Age threshold in minutes beyond which current-state.md is considered stale. */
const STALE_CURRENT_STATE_MINUTES = 120;

/** Age threshold in minutes beyond which the latest handover is considered stale. */
const STALE_HANDOVER_MINUTES = 180;

/**
 * Age threshold in minutes for loop-risk evidence detection.
 * Mirrors the constant of the same name in subagentHealth.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LOOP_RISK_EVIDENCE_MINUTES = 60;

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the latest handover is absent or stale.
 *
 * Used by risk-level rules (4 and 5) to determine whether the risk is
 * adequately covered by a recent, complete handover document.
 *
 * "Absent" means `latestHandoverAgeMinutes` is null (file does not exist).
 * "Stale" means the age exceeds `STALE_HANDOVER_MINUTES`.
 */
function handoverAbsentOrStale(
  status: Omit<WitnessWorkspaceStatus, 'suggestedAction'>
): boolean {
  return (
    status.latestHandoverAgeMinutes === null ||
    status.latestHandoverAgeMinutes > STALE_HANDOVER_MINUTES
  );
}

// ---------------------------------------------------------------------------
// Rule type
// ---------------------------------------------------------------------------

/**
 * A single rule in the suggested-action priority list.
 *
 * `predicate` receives the status record (without the `suggestedAction` field,
 * which is being computed). When it returns `true`, `action` is selected and
 * no further rules are evaluated.
 */
interface ActionRule {
  predicate: (status: Omit<WitnessWorkspaceStatus, 'suggestedAction'>) => boolean;
  action: WitnessSuggestedAction;
}

// ---------------------------------------------------------------------------
// Rule table (v3.3 — full 15-rule engine, locked priority order)
// ---------------------------------------------------------------------------

/**
 * Priority-ordered list of rules. First matching rule wins.
 *
 * Rules are evaluated in the order they appear in this array.
 * The final entry is the unconditional default (all-clear).
 */
const RULES: ActionRule[] = [
  // Rule 1 — No .witness/ directory.
  {
    predicate: s => !s.hasWitness,
    action: {
      id: 'init-project',
      label: 'Initialize Project',
      reason:
        'No .witness/ directory found. Run Initialize Project to set up the Witness artifact system.',
      commandId: 'witness.initProject',
      severity: 'warning',
    },
  },

  // Rule 2 — No active session.
  {
    predicate: s => s.activeSessionId === null,
    action: {
      id: 'start-session',
      label: 'Start Session',
      reason:
        'No active session detected. Run Start Session to begin tracking continuity for this work period.',
      commandId: 'witness.startSession',
      severity: 'warning',
    },
  },

  // Rule 3 — Blocked or failed subagents present.
  {
    predicate: s => s.blockedOrFailedSubagents > 0,
    action: {
      id: 'review-blocked-subagent',
      label: 'Review Blocked Subagent',
      reason:
        'One or more subagent tasks have a blocked, failed, or rejected status. ' +
        'Review workspace status for details and decide how to proceed.',
      commandId: 'witness.showWorkspaceStatus',
      severity: 'critical',
    },
  },

  // Rule 4 — RED or BLOCKED risk level and handover absent or stale.
  //
  // Risk at RED/BLOCKED with no fresh handover means context preservation is
  // urgent: the risk is active and the current continuity record may be
  // incomplete or missing.
  {
    predicate: s =>
      (s.latestRiskLevel === 'RED' || s.latestRiskLevel === 'BLOCKED') &&
      handoverAbsentOrStale(s),
    action: {
      id: 'address-red-risk',
      label: 'Address Red Risk',
      reason:
        'The latest risk assessment is RED or BLOCKED and the handover document is absent or stale. ' +
        'Preserve context by creating or refreshing the handover before continuing.',
      commandId: 'witness.generateHandover',
      severity: 'critical',
    },
  },

  // Rule 5 — ORANGE risk level and handover absent or stale.
  {
    predicate: s =>
      s.latestRiskLevel === 'ORANGE' &&
      handoverAbsentOrStale(s),
    action: {
      id: 'review-orange-risk',
      label: 'Review Orange Risk',
      reason:
        'The latest risk assessment is ORANGE and the handover document is absent or stale. ' +
        'Review the identified risks and refresh the handover to preserve context.',
      commandId: 'witness.generateHandover',
      severity: 'warning',
    },
  },

  // Rule 6 — Subagent reports awaiting orchestrator review.
  {
    predicate: s => s.pendingSubagentReviews > 0,
    action: {
      id: 'review-subagent',
      label: 'Review Subagent Task',
      reason:
        'One or more subagent tasks have a completion report but no orchestrator review. ' +
        'Run Review Subagent Task to close the loop.',
      commandId: 'witness.reviewSubagentTask',
      severity: 'warning',
    },
  },

  // Rule 7 — Loop-risk subagents: evidence present and stale, no report yet.
  {
    predicate: s => s.subagentHealthSummary.loopRiskCount > 0,
    action: {
      id: 'check-subagent-loop-risk',
      label: 'Check Subagent Loop Risk',
      reason:
        'One or more subagent tasks have stale evidence but no completion report. ' +
        'This may indicate a stuck or looping subagent. Review workspace status for details.',
      commandId: 'witness.showWorkspaceStatus',
      severity: 'warning',
    },
  },

  // Rule 8 — Incomplete subagent ledgers (contract present, report or review absent).
  {
    predicate: s => s.incompleteSubagentLedgers > 0,
    action: {
      id: 'check-subagent-progress',
      label: 'Check Subagent Progress',
      reason:
        'One or more subagent tasks have been started but are not yet complete. ' +
        'Review workspace status for details.',
      commandId: 'witness.showWorkspaceStatus',
      severity: 'warning',
    },
  },

  // Rule 9 — current-state.md is stale (> STALE_CURRENT_STATE_MINUTES).
  //
  // Stale-before-missing: an aging state record is a higher-priority signal
  // than absence, because the developer has already adopted the capture habit
  // but has not refreshed it recently.
  {
    predicate: s =>
      s.currentStateExists &&
      s.currentStateAgeMinutes !== null &&
      s.currentStateAgeMinutes > STALE_CURRENT_STATE_MINUTES,
    action: {
      id: 'refresh-current-state',
      label: 'Refresh Current State',
      reason:
        `Current state is more than ${STALE_CURRENT_STATE_MINUTES} minutes old. ` +
        'Run Compress State to capture a fresh snapshot.',
      commandId: 'witness.compressState',
      severity: 'warning',
    },
  },

  // Rule 10 — No current-state.md.
  {
    predicate: s => !s.currentStateExists,
    action: {
      id: 'capture-current-state',
      label: 'Capture Current State',
      reason:
        'No current-state.md found. Run Compress State to record the current project state.',
      commandId: 'witness.compressState',
      severity: 'warning',
    },
  },

  // Rule 11 — Handover present but no context packet assembled.
  {
    predicate: s => s.latestHandoverExists && !s.latestContextPacketExists,
    action: {
      id: 'create-context-packet',
      label: 'Create Context Packet',
      reason:
        'A handover document exists but no context packet has been assembled. ' +
        'Run Create Context Packet to prepare a reviewed context bundle for the next session.',
      commandId: 'witness.createContextPacket',
      severity: 'info',
    },
  },

  // Rule 12 — Latest handover is stale (> STALE_HANDOVER_MINUTES).
  {
    predicate: s =>
      s.latestHandoverExists &&
      s.latestHandoverAgeMinutes !== null &&
      s.latestHandoverAgeMinutes > STALE_HANDOVER_MINUTES,
    action: {
      id: 'refresh-handover',
      label: 'Refresh Handover',
      reason:
        `The latest handover is more than ${STALE_HANDOVER_MINUTES} minutes old. ` +
        'Run Generate Handover to update it.',
      commandId: 'witness.generateHandover',
      severity: 'warning',
    },
  },

  // Rule 13 — Latest context packet may need review (mandatory markers present).
  {
    predicate: s => s.latestContextPacketHasMandatoryMarkers === true,
    action: {
      id: 'review-context-packet',
      label: 'Review Context Packet',
      reason:
        'The latest context packet contains unfilled mandatory placeholders ' +
        '(e.g. {{, TODO, MANDATORY, [MISSING, <fill). Review and complete the packet before handing off.',
      commandId: 'witness.createContextPacket',
      severity: 'warning',
    },
  },

  // Rule 14 — Telemetry not active (events.jsonl absent).
  {
    predicate: s => !s.telemetryEventsExists,
    action: {
      id: 'telemetry-not-active',
      label: 'Telemetry Not Active',
      reason:
        'No telemetry events file found under .witness/telemetry/otel/. ' +
        'Run Observe Workspace to initialise telemetry for this session.',
      commandId: 'witness.observeWorkspace',
      severity: 'info',
    },
  },

  // Rule 15 — Default: all conditions nominal.
  {
    predicate: () => true,
    action: {
      id: 'all-clear',
      label: 'All Clear',
      reason: 'No high-priority continuity actions detected. Continue working.',
      severity: 'info',
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Selects the single most relevant next action based on the current workspace
 * status.
 *
 * Evaluates `RULES` in priority order and returns the first matching action.
 * The input is `Omit<WitnessWorkspaceStatus, "suggestedAction">` to avoid
 * requiring a partially constructed object with a placeholder action field.
 *
 * This function is synchronous and stateless. It performs no filesystem reads.
 *
 * @param status - The computed workspace status record, without `suggestedAction`.
 * @returns The selected `WitnessSuggestedAction`.
 */
export function selectSuggestedAction(
  status: Omit<WitnessWorkspaceStatus, 'suggestedAction'>
): WitnessSuggestedAction {
  for (const rule of RULES) {
    if (rule.predicate(status)) {
      return rule.action;
    }
  }

  // The default rule (last entry) is unconditional, so this line is
  // unreachable in practice. TypeScript requires it for type safety.
  return RULES[RULES.length - 1].action;
}
