// ---------------------------------------------------------------------------
// statusBar.ts — Witness status bar assistant (v6.6).
// ---------------------------------------------------------------------------
//
// Displays current continuity state in the VS Code status bar and offers a
// beginner-first QuickPick of actions when the item is clicked.
//
// v5.4 change: QuickPick is restructured into three sections:
//   Section 1 — Recommended: one context-aware top action.
//   Section 2 — Beginner Actions: seven beginner-safe commands.
//   Section 3 — Advanced Actions: existing advanced commands.
// Advanced commands remain available; they are visually separated below.
//
// v6.6 change: Recommended item priority updated to surface v6 maintenance
// needs (C/D) before the legacy continuity resolver (E). Beginner Actions
// extended with two v6 commands. Tooltip includes one concise maintenance
// line.
//
// Design invariants:
//   - One status bar item, created in `initializeWitnessStatusBar` and never
//     recreated. Disposed via context.subscriptions.
//   - Status is recomputed on activation, after `.witness/` file saves
//     (debounced 2000 ms), and after QuickPick command execution.
//   - No timers other than the save-event debounce.
//   - No continuous scanning.
//   - Does not throw to extension activation on status computation failure.
//   - No LLM calls. No automatic command execution.
//   - No raw artifact content in tooltip text.
//   - Telemetry is emitted only by the commands that the user selects; this
//     module emits no telemetry events of its own.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot } from './witnessPaths';
import { computeWorkspaceStatus, WitnessWorkspaceStatus } from './workspaceStatus';
import { resolveTopIssue } from './continuityResolver';
import { computeMaintenanceNeed } from './maintenanceTriggerEngine';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** The single status bar item managed by this module. */
let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * The most recently computed workspace status, or `null` if status has not
 * yet been computed or computation failed.
 */
let latestStatus: WitnessWorkspaceStatus | null = null;

/** Timer handle for the `.witness/` save-event debounce. */
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce interval in milliseconds for `.witness/` file save events. */
const SAVE_DEBOUNCE_MS = 2000;

// ---------------------------------------------------------------------------
// Internal command ID
// ---------------------------------------------------------------------------

/**
 * VS Code command ID for the status bar click handler.
 *
 * This command is registered internally by `initializeWitnessStatusBar` and
 * is NOT added to `package.json` contributes.commands — it is invoked by the
 * status bar item only.
 */
const STATUS_ACTIONS_COMMAND = 'witness.openStatusActions';

// ---------------------------------------------------------------------------
// Label mapping
// ---------------------------------------------------------------------------

/**
 * Maps the current `WitnessWorkspaceStatus` to the status bar text label.
 *
 * Label priority:
 *   1. No workspace root        → `Witness: No Workspace`
 *   2. activeSessionId is null  → `Witness: No Session`
 *   3. severity critical        → `Witness: Attention`
 *   4. severity warning         → `Witness: Review Needed`
 *   5. info + id not all-clear  → `Witness: Checkpoint`
 *   6. info + id all-clear      → `Witness: OK`
 */
function statusLabel(status: WitnessWorkspaceStatus | null, hasWorkspace: boolean): string {
  if (!hasWorkspace) {
    return 'Witness: No Workspace';
  }
  if (status === null) {
    return 'Witness: Status Error';
  }
  if (status.activeSessionId === null) {
    return 'Witness: No Session';
  }
  const { severity, id } = status.suggestedAction;
  if (severity === 'critical') {
    return 'Witness: Attention';
  }
  if (severity === 'warning') {
    return 'Witness: Review Needed';
  }
  // severity === 'info'
  if (id === 'all-clear') {
    return 'Witness: OK';
  }
  return 'Witness: Checkpoint';
}

// ---------------------------------------------------------------------------
// Tooltip formatting
// ---------------------------------------------------------------------------

/**
 * Formats a whole-minutes age value as a human-readable string.
 *
 * @param ageMinutes - Age in whole minutes, or `null` if the artifact does not exist.
 * @returns `"<N> min old"` or `"unknown age"` if `null`.
 */
function formatAgeMinutes(ageMinutes: number | null): string {
  if (ageMinutes === null) {
    return 'unknown age';
  }
  return `${ageMinutes} min old`;
}

/**
 * Formats an artifact existence + age pair as a short status string.
 *
 * @param exists     - Whether the artifact file exists.
 * @param ageMinutes - Age in whole minutes, or `null`.
 * @returns `"missing"` or `"exists, <N> min old"` / `"exists, unknown age"`.
 */
function formatExistsAge(exists: boolean, ageMinutes: number | null): string {
  if (!exists) {
    return 'missing';
  }
  return `exists, ${formatAgeMinutes(ageMinutes)}`;
}

/**
 * Builds a rich MarkdownString tooltip for the Witness status bar item.
 *
 * Covers: status label, active session, suggested action + reason, artifact
 * ages (current-state, handover, context packet + mandatory-marker flag),
 * subagent health counts (including loop-risk when non-zero), and telemetry
 * state.
 *
 * No raw artifact contents are included. Counts and metadata only.
 * Never throws — all field access is guarded.
 *
 * @param status       - Most recently computed workspace status, or `null`.
 * @param hasWorkspace - Whether a workspace folder is currently open.
 * @returns A `vscode.MarkdownString` suitable for `StatusBarItem.tooltip`.
 */
function buildTooltip(
  status: WitnessWorkspaceStatus | null,
  hasWorkspace: boolean
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();

  // No workspace open.
  if (!hasWorkspace) {
    md.appendMarkdown('No workspace folder is open.');
    return md;
  }

  // Status computation failed or not yet run.
  if (status === null) {
    md.appendMarkdown(
      'Witness: status not computed yet. Click to open Witness actions.'
    );
    return md;
  }

  // --- Title: current status bar label ---
  const label = statusLabel(status, true);
  md.appendMarkdown(`**${label}**\n\n`);

  // --- Session ---
  const sessionText = status.activeSessionId ?? 'none';
  md.appendMarkdown(`Active session: \`${sessionText}\`\n`);

  // --- Suggested action ---
  md.appendMarkdown(`Suggested action: ${status.suggestedAction.label}\n\n`);
  md.appendMarkdown(`Reason:\n${status.suggestedAction.reason}\n\n`);

  // --- v6 maintenance need (one concise line) ---
  try {
    const need = computeMaintenanceNeed({ status });
    const maintenanceText = need.kind !== 'none' ? need.title : 'up to date';
    md.appendMarkdown(`Maintenance: ${maintenanceText}\n\n`);
  } catch {
    // Non-fatal — omit the maintenance line rather than breaking the tooltip.
  }

  // --- Artifact ages ---
  md.appendMarkdown(
    `Current state: ${formatExistsAge(status.currentStateExists, status.currentStateAgeMinutes)}\n`
  );
  md.appendMarkdown(
    `Latest handover: ${formatExistsAge(status.latestHandoverExists, status.latestHandoverAgeMinutes)}\n`
  );

  // Context packet — include mandatory-marker status when the file exists.
  let cpText = formatExistsAge(
    status.latestContextPacketExists,
    status.latestContextPacketAgeMinutes
  );
  if (status.latestContextPacketExists) {
    if (status.latestContextPacketHasMandatoryMarkers === true) {
      cpText += ', mandatory markers present';
    } else if (status.latestContextPacketHasMandatoryMarkers === false) {
      cpText += ', no markers';
    }
  }
  md.appendMarkdown(`Context packet: ${cpText}\n\n`);

  // --- Subagent health ---
  const loopRisk = status.subagentHealthSummary.loopRiskCount;
  md.appendMarkdown('Subagents:\n');
  md.appendMarkdown(`- Pending reviews: ${status.pendingSubagentReviews}\n`);
  md.appendMarkdown(`- Incomplete ledgers: ${status.incompleteSubagentLedgers}\n`);
  md.appendMarkdown(`- Blocked/failed: ${status.blockedOrFailedSubagents}\n`);
  if (loopRisk > 0) {
    md.appendMarkdown(`- Loop-risk: ${loopRisk}\n`);
  }
  md.appendMarkdown('\n');

  // --- Telemetry ---
  const telemetryText = status.telemetryEventsExists ? 'active' : 'inactive';
  md.appendMarkdown(`Telemetry: ${telemetryText}\n\n`);

  md.appendMarkdown('Click for actions.');

  return md;
}

// ---------------------------------------------------------------------------
// Status bar color
// ---------------------------------------------------------------------------

/**
 * Returns the VS Code ThemeColor background for the status bar item, or
 * `undefined` for neutral (info) states.
 */
function statusColor(
  status: WitnessWorkspaceStatus | null
): vscode.ThemeColor | undefined {
  if (status === null) {
    return undefined;
  }
  const { severity } = status.suggestedAction;
  if (severity === 'critical') {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (severity === 'warning') {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// QuickPick items
// ---------------------------------------------------------------------------

/**
 * Extended QuickPickItem used by the status bar handler.
 *
 * `commandId` is optional so that separator items (which are never selected
 * and never executed) can be included in the same array type. The
 * `openStatusActions` handler guards for a missing `commandId` before calling
 * `executeCommand`.
 */
interface StatusQuickPickItem extends vscode.QuickPickItem {
  commandId?: string;
}

// ---------------------------------------------------------------------------
// Recommended item builder
// ---------------------------------------------------------------------------

/**
 * Determines and builds the single "Recommended" QuickPick item for the
 * current workspace state.
 *
 * Selection priority (v6.6 spec):
 *   A. `status === null`                        → Show Workspace Status
 *   B. `status.activeSessionId === null`        → Start Tracking This Task
 *   C/D. computeMaintenanceNeed → kind !== none → Maintain: <title>
 *      (witness.updateProjectMemoryWithAgent)
 *   E. `suggestedAction.id !== 'all-clear'`     → Resolve: <label>
 *      Description: resolver plan `whatHappened`, fallback to `reason`.
 *   F. All-clear with active session            → Create Checkpoint
 *
 * Wraps `resolveTopIssue` and `computeMaintenanceNeed` in try/catch —
 * failures in either are non-fatal and fall through to the next case.
 */
function buildRecommendedItem(
  status: WitnessWorkspaceStatus | null
): StatusQuickPickItem {
  // A. No status available.
  if (status === null) {
    return {
      label: 'Witness: Show Workspace Status',
      description: 'Open the detailed Witness status report.',
      commandId: 'witness.showWorkspaceStatus',
    };
  }

  // B. No active session — prompt to start one.
  if (status.activeSessionId === null) {
    return {
      label: 'Start Tracking This Task',
      description: 'Begin a tracked work block and get a coding-agent prompt.',
      commandId: 'witness.startTrackingTask',
    };
  }

  // C/D. v6 maintenance need — surfaces artifact maintenance before legacy resolver.
  try {
    const need = computeMaintenanceNeed({ status });
    if (need.kind !== 'none') {
      return {
        label: `Maintain: ${need.title}`,
        description: need.reason,
        commandId: 'witness.updateProjectMemoryWithAgent',
      };
    }
  } catch {
    // computeMaintenanceNeed failure is non-fatal — fall through to E.
  }

  // E. Non-all-clear issue — offer the resolver.
  if (status.suggestedAction.id !== 'all-clear') {
    let description = status.suggestedAction.reason;
    try {
      const plan = resolveTopIssue(status);
      if (plan.whatHappened && plan.whatHappened.length > 0) {
        description = plan.whatHappened;
      }
    } catch {
      // resolveTopIssue failure is non-fatal — fall back to reason above.
    }
    return {
      label: `Resolve: ${status.suggestedAction.label}`,
      description,
      commandId: 'witness.resolveContinuityIssue',
    };
  }

  // F. All-clear with active session — checkpoint is the safe next step.
  return {
    label: 'Create Checkpoint',
    description: 'Save progress so a future AI session can resume safely.',
    commandId: 'witness.createCheckpoint',
  };
}

// ---------------------------------------------------------------------------
// QuickPick list builder
// ---------------------------------------------------------------------------

/**
 * Builds the beginner-first QuickPick item list for the status bar (v6.6).
 *
 * Structure:
 *   Separator — "Recommended"
 *     One context-aware top action (A–F priority per v6.6 spec).
 *   Separator — "Beginner Actions"
 *     Seven beginner-safe commands, deduplicated against recommended.
 *   Separator — "Advanced Actions"
 *     Existing advanced commands, deduplicated against recommended and beginner.
 *
 * Separator items use `vscode.QuickPickItemKind.Separator` and have no
 * `commandId`. The handler guards for this before calling `executeCommand`.
 */
function buildQuickPickItems(
  status: WitnessWorkspaceStatus | null
): StatusQuickPickItem[] {
  const recommended = buildRecommendedItem(status);
  const recommendedId = recommended.commandId;

  // --- Section 2: Beginner Actions ---
  // Seven beginner-safe commands, deduplicated against the recommended item.
  const beginnerCandidates: StatusQuickPickItem[] = [
    {
      label: 'Witness: Start Tracking This Task',
      description: 'Begin a tracked work block and get a coding-agent prompt.',
      commandId: 'witness.startTrackingTask',
    },
    {
      label: 'Witness: Create Checkpoint',
      description: 'Save enough project memory for a later AI session.',
      commandId: 'witness.createCheckpoint',
    },
    {
      label: 'Witness: Resume with Witness',
      description: 'Generate a copy-ready resume prompt.',
      commandId: 'witness.resumeWithWitness',
    },
    {
      label: 'Witness: Resolve Continuity Issue',
      description: 'Explain and resolve the current top Witness issue.',
      commandId: 'witness.resolveContinuityIssue',
    },
    {
      label: 'Witness: Update Project Memory with Agent',
      description: 'Generate a prompt for your coding agent to update project memory.',
      commandId: 'witness.updateProjectMemoryWithAgent',
    },
    {
      label: 'Witness: Validate Artifact Maintenance',
      description: 'Validate that artifact-only maintenance stayed inside .witness/',
      commandId: 'witness.validateArtifactMaintenance',
    },
    {
      label: 'Witness: Show Workspace Status',
      description: 'Open the detailed Witness status report.',
      commandId: 'witness.showWorkspaceStatus',
    },
  ];
  const beginnerItems = beginnerCandidates.filter(
    item => item.commandId !== recommendedId
  );

  // --- Section 3: Advanced Actions ---
  // Deduplicated against recommended and all beginner items shown.
  const knownIds = new Set<string | undefined>([
    recommendedId,
    ...beginnerItems.map(i => i.commandId),
  ]);
  const advancedCandidates: StatusQuickPickItem[] = [
    {
      label: 'Witness: Start Session',
      description: 'Begin a new tracked session',
      commandId: 'witness.startSession',
    },
    {
      label: 'Witness: Record Context Snapshot',
      description: 'Capture a context snapshot for the current session',
      commandId: 'witness.recordContext',
    },
    {
      label: 'Witness: Observe Workspace',
      description: 'Run workspace observation and emit telemetry',
      commandId: 'witness.observeWorkspace',
    },
    {
      label: 'Witness: Assess Continuity Risk',
      description: 'Assess and record continuity risk for the current session',
      commandId: 'witness.assessRisk',
    },
    {
      label: 'Witness: Generate Handover',
      description: 'Generate a handover document for session continuity',
      commandId: 'witness.generateHandover',
    },
    {
      label: 'Witness: Create Context Packet',
      description: 'Assemble a context packet for the next session',
      commandId: 'witness.createContextPacket',
    },
    {
      label: 'Witness: Review Subagent Task',
      description: 'Review a completed subagent task report',
      commandId: 'witness.reviewSubagentTask',
    },
    {
      label: 'Witness: Prepare Session Switch',
      description: 'Run the full pre-switch artifact sequence',
      commandId: 'witness.prepareSessionSwitch',
    },
    {
      label: 'Witness: Generate Evaluation Summary',
      description: 'Generate a session evaluation summary',
      commandId: 'witness.generateEvaluationSummary',
    },
  ];
  const advancedItems = advancedCandidates.filter(
    item => !knownIds.has(item.commandId)
  );

  // --- Assemble ---
  const separator = (label: string): StatusQuickPickItem => ({
    label,
    kind: vscode.QuickPickItemKind.Separator,
  });

  return [
    separator('Recommended'),
    recommended,
    separator('Beginner Actions'),
    ...beginnerItems,
    separator('Advanced Actions'),
    ...advancedItems,
  ];
}

// ---------------------------------------------------------------------------
// Core refresh
// ---------------------------------------------------------------------------

/**
 * Recomputes the workspace status and updates the status bar item text,
 * tooltip, color, and command.
 *
 * Safe to call at any time. Never throws. If computation fails the status bar
 * shows the error label and tooltip.
 */
export async function refreshWitnessStatusBar(): Promise<void> {
  if (!statusBarItem) {
    return;
  }

  const workspaceRoot = getWorkspaceRoot();
  const hasWorkspace = workspaceRoot !== undefined;

  if (!hasWorkspace) {
    latestStatus = null;
    statusBarItem.text = statusLabel(null, false);
    statusBarItem.tooltip = buildTooltip(null, false);
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
    return;
  }

  try {
    latestStatus = await computeWorkspaceStatus(workspaceRoot!);
  } catch {
    // computeWorkspaceStatus should never throw (it has its own catch-all),
    // but guard here to be safe.
    latestStatus = null;
  }

  statusBarItem.text = statusLabel(latestStatus, hasWorkspace);
  statusBarItem.tooltip = buildTooltip(latestStatus, hasWorkspace);
  statusBarItem.backgroundColor = statusColor(latestStatus);
  statusBarItem.show();
}

// ---------------------------------------------------------------------------
// QuickPick handler
// ---------------------------------------------------------------------------

/**
 * Opens the Witness actions QuickPick using the most recently computed status.
 *
 * After the user selects and executes a command, the status bar is refreshed.
 */
async function openStatusActions(): Promise<void> {
  const items = buildQuickPickItems(latestStatus);

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Witness Actions',
    placeHolder: 'Select an action',
  });

  // Guard: separators have no commandId and are never returned by showQuickPick,
  // but check defensively to satisfy TypeScript and future-proof the handler.
  if (!picked || !picked.commandId) {
    return;
  }

  try {
    await vscode.commands.executeCommand(picked.commandId);
  } catch {
    // If the command fails, the user will see VS Code's own error notification.
    // We do not re-throw.
  }

  // Refresh status after the selected command completes.
  await refreshWitnessStatusBar();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Creates the Witness status bar item, registers all update listeners, and
 * computes the initial status.
 *
 * Must be called once from `extension.ts` during activation. All disposables
 * are pushed to `context.subscriptions` so they are cleaned up automatically
 * on extension deactivation.
 */
export function initializeWitnessStatusBar(context: vscode.ExtensionContext): void {
  // Create the status bar item.
  // Priority 100 keeps it visible without competing with high-priority items.
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = STATUS_ACTIONS_COMMAND;
  statusBarItem.text = 'Witness: Loading...';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register the internal QuickPick command (not in package.json contributes).
  const statusActionsCmd = vscode.commands.registerCommand(
    STATUS_ACTIONS_COMMAND,
    openStatusActions
  );
  context.subscriptions.push(statusActionsCmd);

  // Register the .witness/ file save listener with debounce.
  const saveListener = vscode.workspace.onDidSaveTextDocument(document => {
    // Only refresh when the saved file is inside a .witness/ directory.
    const fsPath = document.uri.fsPath;
    const separator = require('path').sep as string;
    const witnessSegment = `${separator}.witness${separator}`;
    if (!fsPath.includes(witnessSegment) && !fsPath.includes('/.witness/')) {
      return;
    }

    // Cancel any pending debounce timer.
    if (saveDebounceTimer !== null) {
      clearTimeout(saveDebounceTimer);
    }

    saveDebounceTimer = setTimeout(() => {
      saveDebounceTimer = null;
      void refreshWitnessStatusBar();
    }, SAVE_DEBOUNCE_MS);
  });
  context.subscriptions.push(saveListener);

  // Register a workspace folders change listener so label updates when the
  // user opens or closes a folder without reloading the extension.
  const foldersListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    void refreshWitnessStatusBar();
  });
  context.subscriptions.push(foldersListener);

  // Dispose the debounce timer on deactivation via a synthetic disposable.
  context.subscriptions.push({
    dispose() {
      if (saveDebounceTimer !== null) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
      }
    },
  });

  // Compute initial status asynchronously. Do not await — activation must not
  // block on filesystem I/O.
  void refreshWitnessStatusBar();
}
