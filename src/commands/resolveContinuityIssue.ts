// ---------------------------------------------------------------------------
// resolveContinuityIssue.ts — Witness: Resolve Continuity Issue (v4.2).
// ---------------------------------------------------------------------------
//
// Translates the top-priority continuity issue from the current workspace
// status into developer-friendly language and guides the developer through
// resolving it in one interaction.
//
// The command answers four questions for every issue:
//   1. What happened?
//   2. Why does it matter?
//   3. What should I do next?
//   4. What evidence did Witness use?
//
// Design invariants:
//   - Does not write to .witness/ directly. All writes happen only if the
//     developer selects an existing command that performs a write.
//   - Does not automatically execute any command before developer selection.
//   - Does not switch sessions, generate handovers, or review subagent work
//     without an explicit developer selection.
//   - Does not inject context into any coding agent.
//   - No LLM calls. No raw transcript capture. No hidden reasoning capture.
//   - resolveTopIssue uses suggestedAction.id only (Q7 lock honoured here via
//     the resolver module — this command never reads suggestedAction.commandId).
//   - One telemetry event emitted on every exit path.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot } from '../core/witnessPaths';
import { computeWorkspaceStatus } from '../core/workspaceStatus';
import {
  resolveTopIssue,
  ContinuityResolutionPlan,
  ContinuityResolutionAction,
} from '../core/continuityResolver';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';
import { refreshWitnessStatusBar } from '../core/statusBar';

// ---------------------------------------------------------------------------
// Internal QuickPick item type
// ---------------------------------------------------------------------------

/**
 * Wraps a ContinuityResolutionAction for display in the resolution QuickPick.
 *
 * `action` is null for the built-in Cancel item, which the command adds
 * regardless of what the resolver plan provides.
 */
interface ResolverQuickPickItem extends vscode.QuickPickItem {
  action: ContinuityResolutionAction | null;
  isPrimary: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncates a string to `maxLen` characters, appending an ellipsis if cut.
 * Used to keep QuickPick description strings visually manageable.
 */
function truncate(s: string, maxLen = 120): string {
  if (s.length <= maxLen) {
    return s;
  }
  return s.slice(0, maxLen - 1) + '…';
}

/**
 * Formats the resolver plan as a readable markdown document for display in an
 * unsaved editor tab. Opens as `language: 'markdown'` so VS Code can syntax-
 * highlight it; the developer can also open the Markdown Preview from there.
 *
 * The document is opened read-only (unsaved) and is never written to disk.
 */
function formatResolverPreview(plan: ContinuityResolutionPlan): string {
  const evidenceLines =
    plan.evidence.length === 0
      ? '_No evidence recorded._'
      : plan.evidence.map(e => `- ${e}`).join('\n');

  return [
    '# Witness Continuity Issue',
    '',
    '## Issue',
    plan.title,
    '',
    '## What happened',
    plan.whatHappened,
    '',
    '## Why it matters',
    plan.whyItMatters,
    '',
    '## What should I do next',
    plan.whatToDoNext,
    '',
    '## Evidence',
    evidenceLines,
    '',
    '## Actions',
    'Use the QuickPick to choose the next step. ' +
      'Witness will not write or execute anything until you select an action.',
  ].join('\n');
}

/**
 * Converts the plan's primary and secondary actions into QuickPick items.
 *
 * Primary action appears first (if non-null), separated from secondary actions
 * by a separator. A Cancel item is always appended last.
 */
function buildQuickPickItems(plan: ContinuityResolutionPlan): ResolverQuickPickItem[] {
  const items: ResolverQuickPickItem[] = [];

  if (plan.primaryAction !== null) {
    items.push({
      label: plan.primaryAction.label,
      description: truncate(plan.primaryAction.description),
      action: plan.primaryAction,
      isPrimary: true,
    });
  }

  if (plan.secondaryActions.length > 0) {
    if (items.length > 0) {
      // Separator between primary and secondary actions.
      items.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator,
        action: null,
        isPrimary: false,
      });
    }
    for (const secondary of plan.secondaryActions) {
      items.push({
        label: secondary.label,
        description: truncate(secondary.description),
        action: secondary,
        isPrimary: false,
      });
    }
  }

  // Always append a separator and Cancel item.
  items.push({
    label: '',
    kind: vscode.QuickPickItemKind.Separator,
    action: null,
    isPrimary: false,
  });
  items.push({
    label: 'Cancel',
    description: 'Close the resolver without taking any action.',
    action: null,
    isPrimary: false,
  });

  return items;
}

/**
 * Attempts to open each artifact path from the plan in the VS Code editor.
 *
 * Paths are workspace-relative (e.g. `.witness/current-state.md`). If a file
 * does not exist or fails to open, the error is swallowed and the loop
 * continues. Returns the count of files successfully opened.
 *
 * No file content is written. This is a read-only open.
 */
async function openArtifactPaths(
  workspaceRoot: vscode.Uri,
  artifactPaths: string[]
): Promise<number> {
  let opened = 0;
  for (const relPath of artifactPaths) {
    // Split on forward slash to support multi-segment paths portably.
    const parts = relPath.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
    if (parts.length === 0) {
      continue;
    }
    const uri = vscode.Uri.joinPath(workspaceRoot, ...parts);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
      opened++;
    } catch {
      // File absent or unreadable — skip silently.
    }
  }
  return opened;
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Resolve Continuity Issue` command.
 *
 * Computes a fresh workspace status, builds a ContinuityResolutionPlan via
 * resolveTopIssue, presents the issue to the developer with a pre-action
 * confirmation, opens relevant artifacts, and presents a resolution QuickPick.
 * All writes are deferred to the command the developer explicitly selects.
 */
export async function resolveContinuityIssue(
  context: vscode.ExtensionContext
): Promise<void> {
  void context;
  const elapsed = createCommandTimer();
  const workspaceRoot = getWorkspaceRoot();

  // -------------------------------------------------------------------------
  // Guard: workspace must be open.
  // -------------------------------------------------------------------------

  if (!workspaceRoot) {
    vscode.window.showErrorMessage(
      'Witness: No workspace folder is open. Open a folder before running this command.'
    );
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.continuity_issue.resolved',
      commandId: 'witness.resolveContinuityIssue',
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        issue_kind: null,
        severity: null,
        selected_action_label: null,
        selected_action_command_id: null,
        was_primary: null,
        artifact_paths_opened: 0,
        evidence_count: 0,
        completed: false,
        cancelled_at: 'no-workspace',
      },
    });
    return;
  }

  // -------------------------------------------------------------------------
  // Step 1: Compute fresh workspace status and build resolver plan.
  // -------------------------------------------------------------------------

  const status = await computeWorkspaceStatus(workspaceRoot);
  const plan = resolveTopIssue(status);

  // -------------------------------------------------------------------------
  // Step 2: All-clear short-circuit.
  // -------------------------------------------------------------------------

  if (plan.issueKind === 'all-clear') {
    vscode.window.showInformationMessage(
      'Witness: No continuity issue needs resolution. Workspace looks healthy.'
    );
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.continuity_issue.resolved',
      commandId: 'witness.resolveContinuityIssue',
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        issue_kind: 'all-clear',
        severity: 'info',
        selected_action_label: null,
        selected_action_command_id: null,
        was_primary: null,
        artifact_paths_opened: 0,
        evidence_count: 0,
        completed: true,
        cancelled_at: null,
      },
    });
    return;
  }

  // -------------------------------------------------------------------------
  // Step 3: Open resolver preview as an unsaved markdown tab.
  //
  // Replaces the former showInformationMessage pre-action notification.
  // The developer can read the four-field summary (what happened, why it
  // matters, what to do next, evidence) at their own pace before the QuickPick
  // appears. No button confirmation is required here.
  // -------------------------------------------------------------------------

  let resolverPreviewOpened = false;
  try {
    const previewContent = formatResolverPreview(plan);
    const previewDoc = await vscode.workspace.openTextDocument({
      content: previewContent,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(previewDoc, { preview: true, preserveFocus: false });
    resolverPreviewOpened = true;
  } catch {
    // Preview open failed — non-fatal. Proceed to QuickPick without it.
  }

  // -------------------------------------------------------------------------
  // Step 4: Open relevant artifacts (read-only).
  // -------------------------------------------------------------------------

  const artifactPathsOpened = await openArtifactPaths(
    workspaceRoot,
    plan.artifactPaths
  );

  // -------------------------------------------------------------------------
  // Step 5: Present resolution QuickPick.
  // -------------------------------------------------------------------------

  const quickPickItems = buildQuickPickItems(plan);

  const picked = await vscode.window.showQuickPick(quickPickItems, {
    title: `Witness: ${plan.title}`,
    placeHolder: plan.whatToDoNext.length <= 80
      ? plan.whatToDoNext
      : 'Select a resolution action',
    matchOnDescription: false,
  });

  // -------------------------------------------------------------------------
  // Step 6: Handle dismissal (no selection).
  // -------------------------------------------------------------------------

  if (!picked) {
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.continuity_issue.resolved',
      commandId: 'witness.resolveContinuityIssue',
      status: 'cancelled',
      durationMs: elapsed(),
      attributes: {
        issue_kind: plan.issueKind,
        severity: plan.severity,
        selected_action_label: null,
        selected_action_command_id: null,
        was_primary: null,
        artifact_paths_opened: artifactPathsOpened,
        evidence_count: plan.evidence.length,
        resolver_preview_opened: resolverPreviewOpened,
        completed: false,
        cancelled_at: 'action-selection',
      },
    });
    void refreshWitnessStatusBar();
    return;
  }

  // -------------------------------------------------------------------------
  // Step 7: Handle Cancel item or separator selection.
  // -------------------------------------------------------------------------

  if (
    picked.action === null ||
    picked.kind === vscode.QuickPickItemKind.Separator
  ) {
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.continuity_issue.resolved',
      commandId: 'witness.resolveContinuityIssue',
      status: 'cancelled',
      durationMs: elapsed(),
      attributes: {
        issue_kind: plan.issueKind,
        severity: plan.severity,
        selected_action_label: picked.label || 'Cancel',
        selected_action_command_id: null,
        was_primary: false,
        artifact_paths_opened: artifactPathsOpened,
        evidence_count: plan.evidence.length,
        resolver_preview_opened: resolverPreviewOpened,
        completed: false,
        cancelled_at: 'action-selection',
      },
    });
    void refreshWitnessStatusBar();
    return;
  }

  // -------------------------------------------------------------------------
  // Step 8: Execute the selected action's command, if it has one.
  //
  // The inner command's own prompts and confirmation gates govern any writes.
  // This command does not bypass, pre-confirm, or auto-answer those prompts.
  // -------------------------------------------------------------------------

  const selectedAction = picked.action;
  const wasPrimary = picked.isPrimary;

  if (selectedAction.commandId) {
    try {
      await vscode.commands.executeCommand(selectedAction.commandId);
    } catch {
      // Inner command failure is non-fatal to the resolver. Record the attempt.
    }
  } else {
    // Informational action (e.g. "Do nothing — mark as seen"): no command to run.
    vscode.window.showInformationMessage(
      `Witness: ${selectedAction.label} — no action taken.`
    );
  }

  // -------------------------------------------------------------------------
  // Step 9: Emit completion telemetry.
  // -------------------------------------------------------------------------

  await emitWitnessEvent({
    workspaceRoot,
    eventName: 'witness.continuity_issue.resolved',
    commandId: 'witness.resolveContinuityIssue',
    status: 'success',
    durationMs: elapsed(),
    attributes: {
      issue_kind: plan.issueKind,
      severity: plan.severity,
      selected_action_label: selectedAction.label,
      selected_action_command_id: selectedAction.commandId ?? null,
      was_primary: wasPrimary,
      artifact_paths_opened: artifactPathsOpened,
      evidence_count: plan.evidence.length,
      resolver_preview_opened: resolverPreviewOpened,
      completed: true,
      cancelled_at: null,
    },
  });

  void refreshWitnessStatusBar();
}
