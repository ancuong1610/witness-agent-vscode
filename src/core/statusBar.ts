// ---------------------------------------------------------------------------
// statusBar.ts — Witness status bar assistant (v9.2).
// ---------------------------------------------------------------------------
//
// Displays current continuity state in the VS Code status bar and offers a
// beginner-first QuickPick of actions when the item is clicked.
//
// v5.4 change: QuickPick is restructured into three sections.
// v7.4 wording: keep behavior unchanged, but use softer section names:
//   Section 1 — Recommended: one context-aware top action.
//   Section 2 — Main Actions: seven beginner-safe commands.
//   Section 3 — More Actions: existing advanced commands.
// More actions remain available; they are visually separated below.
//
// v8.3 change: status bar click menu uses workflow-first aliases in Main
// Actions, moves maintenance aliases into their own section, and keeps
// technical/original commands under More Actions.
//
// v9.2 change: the label uses a Tracking grace state after Start. Stale or
// placeholder current-state evidence alone does not show Save Needed until
// source-work evidence or a stronger maintenance need exists.
//
// Design invariants:
//   - One status bar item, created in `initializeWitnessStatusBar` and never
//     recreated. Disposed via context.subscriptions.
//   - Status is recomputed on activation, after workspace file saves
//     (debounced 2000 ms), after `.witness/` file changes, and after QuickPick
//     command execution.
//   - No timers other than the artifact-change debounce.
//   - No continuous scanning.
//   - Does not throw to extension activation on status computation failure.
//   - No LLM calls. No automatic command execution.
//   - No raw artifact content in tooltip text.
//   - Telemetry is emitted only by the commands that the user selects; this
//     module emits no telemetry events of its own.
//
// ---------------------------------------------------------------------------

import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspaceRoot } from './witnessPaths';
import { computeWorkspaceStatus, WitnessWorkspaceStatus } from './workspaceStatus';
import { resolveTopIssue } from './continuityResolver';
import { computeMaintenanceNeed } from './maintenanceTriggerEngine';
import { observeGit } from './gitObserver';
import { statusLabel } from './statusLabel';

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

/**
 * Whether the latest refresh observed source-work evidence outside `.witness/`.
 * `undefined` means the signal was unavailable (for example, non-git workspace).
 */
let latestMeaningfulWorkEvidence: boolean | undefined;

/** Timer handle for the `.witness/` artifact-change debounce. */
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce interval in milliseconds for `.witness/` file change events. */
const SAVE_DEBOUNCE_MS = 2000;

/** Glob for Witness artifact changes made by VS Code or external agents. */
const WITNESS_ARTIFACT_GLOB = '**/.witness/**';

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
  hasWorkspace: boolean,
  hasMeaningfulWorkEvidence?: boolean
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
  const label = statusLabel(status, true, undefined, { hasMeaningfulWorkEvidence });
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

async function detectMeaningfulWorkEvidence(
  workspaceRoot: vscode.Uri
): Promise<boolean | undefined> {
  const git = await observeGit(workspaceRoot);
  const dirtyPaths = git.primary?.dirtyFilePaths;
  if (dirtyPaths === undefined) {
    return undefined;
  }

  return dirtyPaths.some(isNonWitnessPath);
}

function isNonWitnessPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return !(
    normalized === '.witness' ||
    normalized.startsWith('.witness/')
  );
}

function isInsideWorkspace(filePath: string, workspaceRoot: vscode.Uri): boolean {
  const relative = path.relative(workspaceRoot.fsPath, filePath);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
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

function normalizeWorkflowCommandId(commandId: string | undefined): string | undefined {
  switch (commandId) {
    case 'witness.startWithWitness':
    case 'witness.startTrackingTask':
      return 'witness.start';
    case 'witness.showWorkspaceStatus':
      return 'witness.status';
    case 'witness.createCheckpoint':
      return 'witness.saveProgress';
    case 'witness.resumeWithWitness':
      return 'witness.resume';
    case 'witness.startNewTask':
      return 'witness.switchTask';
    case 'witness.resolveContinuityIssue':
      return 'witness.fixIssue';
    case 'witness.updateProjectMemoryWithAgent':
      return 'witness.updateMemory';
    case 'witness.validateArtifactMaintenance':
      return 'witness.checkMemoryUpdate';
    default:
      return commandId;
  }
}

function normalizeRecommendedItem(item: StatusQuickPickItem): StatusQuickPickItem {
  return {
    ...item,
    commandId: normalizeWorkflowCommandId(item.commandId),
  };
}

// ---------------------------------------------------------------------------
// QuickPick list builder
// ---------------------------------------------------------------------------

/**
 * Builds the workflow-first QuickPick item list for the status bar (v8.3).
 *
 * Structure:
 *   Separator — "Recommended"
 *     One context-aware top action (A–F priority per v6.6 spec).
 *   Separator — "Main Actions"
 *     Seven everyday workflow aliases, deduplicated against recommended.
 *   Separator — "Maintenance"
 *     Two artifact-maintenance aliases, deduplicated against recommended/main.
 *   Separator — "More Actions"
 *     Existing original and advanced commands, deduplicated against prior
 *     sections by workflow-equivalent command ID.
 *
 * Separator items use `vscode.QuickPickItemKind.Separator` and have no
 * `commandId`. The handler guards for this before calling `executeCommand`.
 */
function buildQuickPickItems(
  status: WitnessWorkspaceStatus | null
): StatusQuickPickItem[] {
  const recommended = normalizeRecommendedItem(buildRecommendedItem(status));
  const recommendedId = recommended.commandId;

  // --- Section 2: Main Actions ---
  const mainCandidates: StatusQuickPickItem[] = [
    {
      label: 'Witness: Start',
      description: 'Begin a tracked work block and get a coding-agent prompt.',
      commandId: 'witness.start',
    },
    {
      label: 'Witness: Save Progress',
      description: 'Save enough project memory for a later AI session.',
      commandId: 'witness.saveProgress',
    },
    {
      label: 'Witness: Resume',
      description: 'Generate a copy-ready resume prompt.',
      commandId: 'witness.resume',
    },
    {
      label: 'Witness: Switch Task',
      description: 'Safely move from the current work block to a new task.',
      commandId: 'witness.switchTask',
    },
    {
      label: 'Witness: Status',
      description: 'Open the detailed Witness status report.',
      commandId: 'witness.status',
    },
    {
      label: 'Witness: Cheatsheet',
      description: 'Open the one-page workflow guide.',
      commandId: 'witness.cheatsheet',
    },
    {
      label: 'Witness: Fix Issue',
      description: 'Explain and resolve the current top Witness issue.',
      commandId: 'witness.fixIssue',
    },
  ];
  const mainItems = mainCandidates.filter(
    item => normalizeWorkflowCommandId(item.commandId) !== recommendedId
  );

  // --- Section 3: Maintenance ---
  const knownIds = new Set<string | undefined>([
    recommendedId,
    ...mainItems.map(i => normalizeWorkflowCommandId(i.commandId)),
  ]);
  const maintenanceCandidates: StatusQuickPickItem[] = [
    {
      label: 'Witness: Update Memory',
      description: 'Generate a prompt for your coding agent to update project memory.',
      commandId: 'witness.updateMemory',
    },
    {
      label: 'Witness: Check Memory Update',
      description: 'Validate that artifact-only maintenance stayed inside .witness/',
      commandId: 'witness.checkMemoryUpdate',
    },
  ];
  const maintenanceItems = maintenanceCandidates.filter(
    item => !knownIds.has(normalizeWorkflowCommandId(item.commandId))
  );

  // --- Section 4: More Actions ---
  // Deduplicated against the recommended workflow equivalent. Original command
  // names remain available here unless they duplicate the current top action.
  const allKnownIds = new Set<string | undefined>([
    ...knownIds,
    ...maintenanceItems.map(i => i.commandId),
  ]);
  const advancedCandidates: StatusQuickPickItem[] = [
    {
      label: 'Witness: Enable for This Project',
      description: 'Initialize Witness for this workspace',
      commandId: 'witness.enableProject',
    },
    {
      label: 'Witness: Start with Witness',
      description: 'Original compressed first-use entry point',
      commandId: 'witness.startWithWitness',
    },
    {
      label: 'Witness: Start Tracking This Task',
      description: 'Original beginner command for starting task tracking',
      commandId: 'witness.startTrackingTask',
    },
    {
      label: 'Witness: Start New Task',
      description: 'Original command for switching tasks safely',
      commandId: 'witness.startNewTask',
    },
    {
      label: 'Witness: Create Checkpoint',
      description: 'Original command for saving project memory',
      commandId: 'witness.createCheckpoint',
    },
    {
      label: 'Witness: Resume with Witness',
      description: 'Original command for generating a resume prompt',
      commandId: 'witness.resumeWithWitness',
    },
    {
      label: 'Witness: Resolve Continuity Issue',
      description: 'Original command for resolving the current top Witness issue',
      commandId: 'witness.resolveContinuityIssue',
    },
    {
      label: 'Witness: Update Project Memory with Agent',
      description: 'Original command for agent-assisted memory updates',
      commandId: 'witness.updateProjectMemoryWithAgent',
    },
    {
      label: 'Witness: Validate Artifact Maintenance',
      description: 'Original command for checking agent-written memory updates',
      commandId: 'witness.validateArtifactMaintenance',
    },
    {
      label: 'Witness: Show Workspace Status',
      description: 'Original command for opening the detailed status report',
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
      label: 'Witness: Create ADR',
      description: 'Record an architecture decision',
      commandId: 'witness.createADR',
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
      label: 'Witness: Validate Handover',
      description: 'Validate a handover document for resume quality',
      commandId: 'witness.validateHandover',
    },
    {
      label: 'Witness: Create Resume Probe',
      description: 'Create a resume-quality probe document',
      commandId: 'witness.createResumeProbe',
    },
    {
      label: 'Witness: Compress Current State',
      description: 'Open current-state.md for manual compression',
      commandId: 'witness.compressState',
    },
    {
      label: 'Witness: Create Context Packet',
      description: 'Assemble a context packet for the next session',
      commandId: 'witness.createContextPacket',
    },
    {
      label: 'Witness: Record Subagent Report',
      description: 'Record a subagent report',
      commandId: 'witness.recordSubagent',
    },
    {
      label: 'Witness: Start Subagent Task',
      description: 'Start a tracked subagent task',
      commandId: 'witness.startSubagentTask',
    },
    {
      label: 'Witness: Create Subagent Context Packet',
      description: 'Create a context packet for subagent work',
      commandId: 'witness.createSubagentContextPacket',
    },
    {
      label: 'Witness: Record Subagent Evidence',
      description: 'Record evidence for a subagent task',
      commandId: 'witness.recordSubagentEvidence',
    },
    {
      label: 'Witness: Complete Subagent Task',
      description: 'Record subagent task completion',
      commandId: 'witness.completeSubagentTask',
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
    item =>
      !allKnownIds.has(item.commandId) &&
      normalizeWorkflowCommandId(item.commandId) !== recommendedId
  );

  // --- Assemble ---
  const separator = (label: string): StatusQuickPickItem => ({
    label,
    kind: vscode.QuickPickItemKind.Separator,
  });

  return [
    separator('Recommended'),
    recommended,
    separator('Main Actions'),
    ...mainItems,
    separator('Maintenance'),
    ...maintenanceItems,
    separator('More Actions'),
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
    latestMeaningfulWorkEvidence = undefined;
    statusBarItem.text = statusLabel(null, false);
    statusBarItem.tooltip = buildTooltip(null, false);
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
    return;
  }

  try {
    latestStatus = await computeWorkspaceStatus(workspaceRoot!);
    latestMeaningfulWorkEvidence = await detectMeaningfulWorkEvidence(workspaceRoot!);
  } catch {
    // computeWorkspaceStatus should never throw (it has its own catch-all),
    // but guard here to be safe.
    latestStatus = null;
    latestMeaningfulWorkEvidence = undefined;
  }

  statusBarItem.text = statusLabel(latestStatus, hasWorkspace, undefined, {
    hasMeaningfulWorkEvidence: latestMeaningfulWorkEvidence,
  });
  statusBarItem.tooltip = buildTooltip(
    latestStatus,
    hasWorkspace,
    latestMeaningfulWorkEvidence
  );
  statusBarItem.backgroundColor = statusColor(latestStatus);
  statusBarItem.show();
}

/**
 * Schedules a single status refresh after a burst of `.witness/` file events.
 */
function scheduleDebouncedRefresh(): void {
  if (saveDebounceTimer !== null) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    void refreshWitnessStatusBar();
  }, SAVE_DEBOUNCE_MS);
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

  // Register a workspace file save listener with debounce. Source saves allow
  // v9.2 Tracking -> Save Needed transitions after meaningful work evidence;
  // .witness saves still refresh artifact-driven status immediately.
  const saveListener = vscode.workspace.onDidSaveTextDocument(document => {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot || !isInsideWorkspace(document.uri.fsPath, workspaceRoot)) {
      return;
    }

    scheduleDebouncedRefresh();
  });
  context.subscriptions.push(saveListener);

  // Register a filesystem watcher so external coding-agent writes to
  // `.witness/` refresh the status bar even when VS Code did not save an
  // open text document.
  const witnessWatcher = vscode.workspace.createFileSystemWatcher(
    WITNESS_ARTIFACT_GLOB,
    false,
    false,
    false
  );
  context.subscriptions.push(
    witnessWatcher.onDidChange(scheduleDebouncedRefresh),
    witnessWatcher.onDidCreate(scheduleDebouncedRefresh),
    witnessWatcher.onDidDelete(scheduleDebouncedRefresh),
    witnessWatcher
  );

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
