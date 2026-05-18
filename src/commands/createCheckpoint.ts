// ---------------------------------------------------------------------------
// createCheckpoint.ts — Witness: Create Checkpoint command (v5.1b).
// ---------------------------------------------------------------------------
//
// Beginner-friendly checkpoint wrapper. Guides the developer through saving
// enough project memory for a later AI coding session to understand what changed.
//
// Workflow:
//   1. Guard: open workspace + initialized project
//   2. Soft session check (warn, offer Cancel or Continue)
//   3. Run witness.observeWorkspace (inner command; preserves its own UX)
//   4. Ask: update current-state now, or skip?
//   5. If update chosen: run witness.compressState (inner command; preserves its own UX)
//   6. Completion message
//
// Design invariants:
//   - Does NOT automatically run assessRisk.
//   - Does NOT automatically generate a handover.
//   - Does NOT automatically create a context packet.
//   - Does NOT write artifacts directly — delegates to existing inner commands.
//   - Inner command failures are caught and recorded in telemetry; they do not
//     abort the checkpoint workflow.
//   - No LLM calls. No automatic context injection. No raw content in telemetry.
//   - One telemetry event emitted on exit regardless of path taken.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';

// ---------------------------------------------------------------------------
// Current-state update QuickPick items
// ---------------------------------------------------------------------------

interface CurrentStateItem extends vscode.QuickPickItem {
  action: 'update' | 'skip';
}

const CURRENT_STATE_ITEMS: CurrentStateItem[] = [
  {
    label: 'Open Current State for Update',
    description: 'Archive the current state file and open it for manual trimming',
    action: 'update',
  },
  {
    label: 'Skip Current State Update',
    description: 'Keep current-state.md as-is and complete the checkpoint',
    action: 'skip',
  },
];

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Create Checkpoint` command (v5.1b).
 *
 * Beginner-friendly wrapper that saves project memory (observe workspace +
 * optionally update current-state) without exposing the full continuity risk
 * model. Delegates all artifact writes to existing inner commands.
 *
 * Beginner framing:
 *   "Save enough project memory so a later AI coding session can understand
 *   what changed."
 *
 * Emits telemetry event `witness.checkpoint.created`.
 */
export async function createCheckpoint(
  _context: vscode.ExtensionContext
): Promise<void> {
  const elapsed = createCommandTimer();

  // Telemetry state.
  let ranObserveWorkspace = false;
  let ranCompressState = false;
  let cancelledAt: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Require an open workspace folder.
    // -------------------------------------------------------------------------

    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      return;
    }

    // -------------------------------------------------------------------------
    // 2. Require .witness/ to exist (project must be enabled).
    // -------------------------------------------------------------------------

    const witnessRoot = getWitnessRoot(workspaceRoot);
    try {
      await vscode.workspace.fs.stat(witnessRoot);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: Run "Witness: Enable for This Project" first.'
      );
      cancelledAt = 'no-witness-dir';
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.checkpoint.created',
        commandId: 'witness.createCheckpoint',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          ran_observe_workspace: ranObserveWorkspace,
          ran_compress_state: ranCompressState,
          completed: false,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 3. Soft session check.
    //    Observe Workspace and Compress Current State both require an active
    //    session. Warn the user if none is active rather than hard-blocking,
    //    so they can still proceed and let the inner commands surface their
    //    own errors.
    // -------------------------------------------------------------------------

    const sessionId = await getCurrentSessionId(witnessRoot);

    if (sessionId === undefined) {
      const sessionChoice = await vscode.window.showWarningMessage(
        'Witness: No active task is being tracked. ' +
        'Some checkpoint steps require an active session. Continue anyway?',
        { modal: true },
        'Continue',
        'Cancel'
      );
      if (!sessionChoice || sessionChoice === 'Cancel') {
        cancelledAt = 'no-active-session';
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.checkpoint.created',
          commandId: 'witness.createCheckpoint',
          sessionId: null,
          status: 'cancelled',
          durationMs: elapsed(),
          attributes: {
            ran_observe_workspace: ranObserveWorkspace,
            ran_compress_state: ranCompressState,
            completed: false,
            cancelled_at: cancelledAt,
          },
        });
        return;
      }
    }

    // -------------------------------------------------------------------------
    // 4. Run witness.observeWorkspace.
    //    Errors are caught silently — inner command shows its own messages.
    //    Inner command UX (opened documents, prompts) is preserved.
    // -------------------------------------------------------------------------

    try {
      await vscode.commands.executeCommand('witness.observeWorkspace');
      ranObserveWorkspace = true;
    } catch {
      // Observe failed (e.g. no active session inside inner command).
      // Continue the checkpoint; the inner command has already shown its error.
    }

    // -------------------------------------------------------------------------
    // 5. Ask whether to update current-state.md now.
    // -------------------------------------------------------------------------

    const statePick = await vscode.window.showQuickPick(CURRENT_STATE_ITEMS, {
      title: 'Witness: Create Checkpoint — Update Project Memory?',
      placeHolder: 'Choose whether to update current-state.md before completing',
    });

    if (!statePick) {
      // User dismissed the QuickPick.
      cancelledAt = 'current-state-selection';
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.checkpoint.created',
        commandId: 'witness.createCheckpoint',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          ran_observe_workspace: ranObserveWorkspace,
          ran_compress_state: ranCompressState,
          completed: false,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 6. If update chosen, run witness.compressState.
    //    Errors caught silently — inner command shows its own messages.
    //    Inner command UX (opened documents, snapshot action) is preserved.
    // -------------------------------------------------------------------------

    if (statePick.action === 'update') {
      try {
        await vscode.commands.executeCommand('witness.compressState');
        ranCompressState = true;
      } catch {
        // CompressState failed (e.g. no active session inside inner command).
        // Continue to completion; the inner command has already shown its error.
      }
    }

    // -------------------------------------------------------------------------
    // 7. Completion.
    // -------------------------------------------------------------------------

    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.checkpoint.created',
      commandId: 'witness.createCheckpoint',
      sessionId: sessionId ?? null,
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        ran_observe_workspace: ranObserveWorkspace,
        ran_compress_state: ranCompressState,
        completed: true,
        cancelled_at: null,
      },
    });

    vscode.window.showInformationMessage('Witness: Checkpoint created.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.checkpoint.created',
      commandId: 'witness.createCheckpoint',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        ran_observe_workspace: ranObserveWorkspace,
        ran_compress_state: ranCompressState,
        completed: false,
        cancelled_at: cancelledAt ?? 'unhandled-error',
      },
    });
    vscode.window.showErrorMessage(`Witness: Create Checkpoint failed — ${message}`);
  }
}
