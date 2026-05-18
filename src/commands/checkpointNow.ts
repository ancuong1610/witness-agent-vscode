// ---------------------------------------------------------------------------
// checkpointNow.ts — Witness: Checkpoint Now command (v3.5).
// ---------------------------------------------------------------------------
//
// Guides the developer through a quick continuity checkpoint:
//   1. Confirmation
//   2. Observe workspace
//   3. Assess continuity risk
//   4. Developer-selected follow-up action
//
// Design invariants:
//   - No automatic command execution before user confirmation.
//   - No auto-selection based on risk level.
//   - Developer chooses every action.
//   - No LLM calls. No raw artifact content in telemetry.
//   - One workflow-level telemetry event emitted on exit (complete or cancelled).
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot } from '../core/witnessPaths';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';
import { refreshWitnessStatusBar } from '../core/statusBar';

// ---------------------------------------------------------------------------
// Follow-up action QuickPick items
// ---------------------------------------------------------------------------

interface FollowUpItem extends vscode.QuickPickItem {
  commandId: string | null;
  stepKey: string;
}

const FOLLOW_UP_ITEMS: FollowUpItem[] = [
  {
    label: 'Compress Current State',
    description: 'Archive current-state.md and open it for manual trimming',
    commandId: 'witness.compressState',
    stepKey: 'compress-state',
  },
  {
    label: 'Generate Handover',
    description: 'Render a handover document from session artifacts',
    commandId: 'witness.generateHandover',
    stepKey: 'generate-handover',
  },
  {
    label: 'Show Workspace Status',
    description: 'View full continuity status report',
    commandId: 'witness.showWorkspaceStatus',
    stepKey: 'show-status',
  },
  {
    label: 'Do Nothing',
    description: 'Checkpoint complete — no further action',
    commandId: null,
    stepKey: 'do-nothing',
  },
];

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Checkpoint Now` command.
 *
 * Guides the developer through observation, risk assessment, and a
 * developer-chosen follow-up action. Emits one workflow-level telemetry event
 * on exit regardless of path.
 */
export async function checkpointNow(
  context: vscode.ExtensionContext
): Promise<void> {
  void context;
  const elapsed = createCommandTimer();
  const workspaceRoot = getWorkspaceRoot();

  // -------------------------------------------------------------------------
  // Step 0 — Confirmation
  // -------------------------------------------------------------------------

  const confirm = await vscode.window.showInformationMessage(
    'Witness: Checkpoint Now will guide you through observing the workspace, ' +
    'assessing continuity risk, and choosing a follow-up action. Continue?',
    'Continue',
    'Cancel'
  );

  if (confirm !== 'Continue') {
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workflow.checkpoint_completed',
      commandId: 'witness.checkpointNow',
      status: 'cancelled',
      durationMs: elapsed(),
      attributes: {
        completed: false,
        cancelled_at: 'initial-confirmation',
        steps_completed: 0,
      },
    });
    return;
  }

  let stepsCompleted = 0;

  // -------------------------------------------------------------------------
  // Step 1 — Observe workspace
  // -------------------------------------------------------------------------

  try {
    await vscode.commands.executeCommand('witness.observeWorkspace');
    stepsCompleted++;
  } catch {
    // Inner command failure is not fatal to the workflow. Continue.
  }

  // -------------------------------------------------------------------------
  // Step 2 — Assess continuity risk
  // -------------------------------------------------------------------------

  try {
    await vscode.commands.executeCommand('witness.assessRisk');
    stepsCompleted++;
  } catch {
    // Inner command failure is not fatal to the workflow. Continue.
  }

  // -------------------------------------------------------------------------
  // Step 3 — Developer-chosen follow-up action
  // -------------------------------------------------------------------------

  const picked = await vscode.window.showQuickPick(FOLLOW_UP_ITEMS, {
    title: 'Witness: Checkpoint — Choose Follow-up Action',
    placeHolder: 'Select a follow-up action',
  });

  if (!picked) {
    // User dismissed the QuickPick.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workflow.checkpoint_completed',
      commandId: 'witness.checkpointNow',
      status: 'cancelled',
      durationMs: elapsed(),
      attributes: {
        completed: false,
        cancelled_at: 'follow-up-selection',
        steps_completed: stepsCompleted,
      },
    });
    return;
  }

  if (picked.commandId !== null) {
    try {
      await vscode.commands.executeCommand(picked.commandId);
      stepsCompleted++;
    } catch {
      // Inner command failure is non-fatal. Record the selection in telemetry.
    }
  }

  // -------------------------------------------------------------------------
  // Completion
  // -------------------------------------------------------------------------

  await emitWitnessEvent({
    workspaceRoot,
    eventName: 'witness.workflow.checkpoint_completed',
    commandId: 'witness.checkpointNow',
    status: 'success',
    durationMs: elapsed(),
    attributes: {
      completed: true,
      cancelled_at: null,
      steps_completed: stepsCompleted,
      selected_next_step: picked.stepKey,
    },
  });

  vscode.window.showInformationMessage('Witness: Checkpoint workflow complete.');

  // Refresh the status bar to reflect the updated workspace state.
  await refreshWitnessStatusBar();
}
