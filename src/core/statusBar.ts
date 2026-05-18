// ---------------------------------------------------------------------------
// statusBar.ts — Witness status bar assistant (v3.4 / v4.3).
// ---------------------------------------------------------------------------
//
// Displays current continuity state in the VS Code status bar and offers a
// QuickPick of recommended actions when the item is clicked.
//
// v4.3 addition: When the workspace has a non-all-clear suggested action, the
// first QuickPick item is a `Resolve:` / `Address:` item that launches the
// `Witness: Resolve Continuity Issue` command. This makes the v4 resolver
// discoverable from the main v3 UX surface without adding any new public
// commands or emitting telemetry from this module.
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
 * Builds the status bar tooltip text from the current workspace status.
 *
 * No raw artifact content is included. Counts and metadata only.
 */
function buildTooltip(status: WitnessWorkspaceStatus | null, hasWorkspace: boolean): string {
  if (!hasWorkspace) {
    return 'Witness: No workspace folder is open.';
  }
  if (status === null) {
    return 'Witness could not compute workspace status. Run Witness: Show Workspace Status for details.';
  }

  const lines: string[] = [];

  lines.push(`Session: ${status.activeSessionId ?? 'none'}`);
  lines.push('');

  lines.push(`Action: ${status.suggestedAction.label}`);
  lines.push(`Reason: ${status.suggestedAction.reason}`);
  lines.push('');

  if (status.latestRiskLevel !== null) {
    lines.push(`Risk level: ${status.latestRiskLevel}`);
  }

  lines.push(`Pending subagent reviews: ${status.pendingSubagentReviews}`);
  lines.push(`Incomplete subagent ledgers: ${status.incompleteSubagentLedgers}`);
  lines.push(`Blocked or failed subagents: ${status.blockedOrFailedSubagents}`);
  lines.push('');

  lines.push(`Telemetry events: ${status.telemetryEventCount}`);

  return lines.join('\n');
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

interface StatusQuickPickItem extends vscode.QuickPickItem {
  commandId: string;
}

/**
 * Builds a resolver QuickPick item for the status bar, or returns `null` if
 * the current workspace state is all-clear or status is unavailable.
 *
 * Uses the `resolveTopIssue` plan's `whatHappened` field as the item
 * description so the developer sees the concrete issue before selecting.
 * Wraps the call in a try/catch — a resolver failure never breaks the status
 * bar QuickPick. Falls back to a generic description if the call throws.
 *
 * Label prefix:
 *   - `warning` or `critical` severity → `Resolve: <suggestedAction.label>`
 *   - `info` (non-all-clear)           → `Address: <suggestedAction.label>`
 */
function buildResolverItem(
  status: WitnessWorkspaceStatus | null
): StatusQuickPickItem | null {
  if (status === null) {
    return null;
  }
  if (status.suggestedAction.id === 'all-clear') {
    return null;
  }

  const { severity, label } = status.suggestedAction;
  const prefix = (severity === 'warning' || severity === 'critical')
    ? 'Resolve'
    : 'Address';

  let description = 'Open the guided resolver for the current Witness issue.';
  try {
    const plan = resolveTopIssue(status);
    if (plan.whatHappened && plan.whatHappened.length > 0) {
      description = plan.whatHappened;
    }
  } catch {
    // resolveTopIssue failure is non-fatal — use generic description above.
  }

  return {
    label: `${prefix}: ${label}`,
    description,
    commandId: 'witness.resolveContinuityIssue',
  };
}

/**
 * Builds the QuickPick item list for the status bar click handler.
 *
 * Order (v4.3):
 *   1. Resolver item — if `suggestedAction.id !== 'all-clear'` (first, always).
 *   2. Suggested action item — if it has a commandId and differs from resolver.
 *   3. Fixed utility commands — deduplicated against resolver and suggested.
 */
function buildQuickPickItems(
  status: WitnessWorkspaceStatus | null
): StatusQuickPickItem[] {
  const fixed: StatusQuickPickItem[] = [
    {
      label: 'Witness: Show Workspace Status',
      description: 'View full continuity status report',
      commandId: 'witness.showWorkspaceStatus',
    },
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
  ];

  // All-clear / no status: no resolver item. Fall through to suggested+fixed.
  const resolverItem = buildResolverItem(status);

  if (status === null) {
    return fixed;
  }

  const action = status.suggestedAction;

  // Build suggested action item if it has a commandId.
  let suggestedItem: StatusQuickPickItem | null = null;
  if (action.commandId) {
    suggestedItem = {
      label: action.label,
      description: `Suggested — ${action.reason}`,
      commandId: action.commandId,
    };
  }

  // Collect commandIds already represented at the top so fixed items are
  // deduplicated correctly.
  const topCommandIds = new Set<string>(['witness.resolveContinuityIssue']);
  if (suggestedItem) {
    topCommandIds.add(suggestedItem.commandId);
  }
  const deduped = fixed.filter(item => !topCommandIds.has(item.commandId));

  // Assemble: resolver first (if non-null), then suggested, then deduped fixed.
  const result: StatusQuickPickItem[] = [];
  if (resolverItem !== null) {
    result.push(resolverItem);
  }
  if (suggestedItem !== null) {
    result.push(suggestedItem);
  }
  result.push(...deduped);
  return result;
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

  if (!picked) {
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
