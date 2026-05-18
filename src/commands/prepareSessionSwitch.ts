// ---------------------------------------------------------------------------
// prepareSessionSwitch.ts — Witness: Prepare Session Switch command (v3.5).
// ---------------------------------------------------------------------------
//
// Guides the developer through the full artifact preparation sequence required
// before switching sessions:
//   1. Check active session
//   2. Confirmation
//   3. Generate handover
//   4. Validate handover
//   5. Create resume probe
//   6. Create context packet
//
// Design invariants:
//   - Does not switch sessions. Does not modify the active session pointer.
//   - Does not start a new session.
//   - Inner commands retain their own user prompts and are not bypassed.
//   - One workflow-level telemetry event emitted on exit (complete or cancelled).
//   - No LLM calls. No raw artifact content in telemetry.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';
import { refreshWitnessStatusBar } from '../core/statusBar';

// ---------------------------------------------------------------------------
// Workflow steps
// ---------------------------------------------------------------------------

interface WorkflowStep {
  commandId: string;
  stepKey: string;
  label: string;
}

const STEPS: WorkflowStep[] = [
  {
    commandId: 'witness.generateHandover',
    stepKey: 'generate-handover',
    label: 'Generate Handover',
  },
  {
    commandId: 'witness.validateHandover',
    stepKey: 'validate-handover',
    label: 'Validate Handover',
  },
  {
    commandId: 'witness.createResumeProbe',
    stepKey: 'create-resume-probe',
    label: 'Create Resume Probe',
  },
  {
    commandId: 'witness.createContextPacket',
    stepKey: 'create-context-packet',
    label: 'Create Context Packet',
  },
];

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Prepare Session Switch` command.
 *
 * Runs the full pre-switch preparation sequence: handover, validation, resume
 * probe, and context packet. Each inner command retains its own user interaction.
 * Does not change the active session ID.
 */
export async function prepareSessionSwitch(
  context: vscode.ExtensionContext
): Promise<void> {
  void context;
  const elapsed = createCommandTimer();
  const workspaceRoot = getWorkspaceRoot();

  // -------------------------------------------------------------------------
  // Step 0 — Verify active session
  // -------------------------------------------------------------------------

  let activeSessionId: string | undefined;

  if (workspaceRoot) {
    try {
      const witnessRoot = getWitnessRoot(workspaceRoot);
      activeSessionId = await getCurrentSessionId(witnessRoot);
    } catch {
      activeSessionId = undefined;
    }
  }

  if (!activeSessionId) {
    vscode.window.showErrorMessage(
      'Witness: No active session found. Start a session before preparing a session switch.'
    );
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workflow.session_switch_prepared',
      commandId: 'witness.prepareSessionSwitch',
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        completed: false,
        cancelled_at: 'no-active-session',
        steps_completed: 0,
        active_session_present: false,
        command_sequence: [],
      },
    });
    return;
  }

  // -------------------------------------------------------------------------
  // Step 1 — Confirmation
  // -------------------------------------------------------------------------

  const confirm = await vscode.window.showInformationMessage(
    'Witness: Prepare Session Switch will guide you through handover generation, ' +
    'handover validation, resume probe creation, and context packet assembly. Continue?',
    'Continue',
    'Cancel'
  );

  if (confirm !== 'Continue') {
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workflow.session_switch_prepared',
      commandId: 'witness.prepareSessionSwitch',
      sessionId: activeSessionId,
      status: 'cancelled',
      durationMs: elapsed(),
      attributes: {
        completed: false,
        cancelled_at: 'initial-confirmation',
        steps_completed: 0,
        active_session_present: true,
        command_sequence: [],
      },
    });
    return;
  }

  // -------------------------------------------------------------------------
  // Steps 2–5 — Execute each preparation step in order
  // -------------------------------------------------------------------------

  let stepsCompleted = 0;
  const commandSequence: string[] = [];

  for (const step of STEPS) {
    try {
      await vscode.commands.executeCommand(step.commandId);
      stepsCompleted++;
      commandSequence.push(step.commandId);
    } catch (err: unknown) {
      // A step threw — emit failure telemetry and surface an error message.
      const message = err instanceof Error ? err.message : String(err);

      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.workflow.session_switch_prepared',
        commandId: 'witness.prepareSessionSwitch',
        sessionId: activeSessionId,
        status: 'error',
        durationMs: elapsed(),
        attributes: {
          completed: false,
          cancelled_at: step.stepKey,
          steps_completed: stepsCompleted,
          active_session_present: true,
          command_sequence: commandSequence,
        },
      });

      vscode.window.showErrorMessage(
        `Witness: Session switch preparation failed at "${step.label}". ${message}`
      );
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Completion
  // -------------------------------------------------------------------------

  await emitWitnessEvent({
    workspaceRoot,
    eventName: 'witness.workflow.session_switch_prepared',
    commandId: 'witness.prepareSessionSwitch',
    sessionId: activeSessionId,
    status: 'success',
    durationMs: elapsed(),
    attributes: {
      completed: true,
      cancelled_at: null,
      steps_completed: stepsCompleted,
      active_session_present: true,
      command_sequence: commandSequence,
    },
  });

  vscode.window.showInformationMessage(
    'Witness: Session switch preparation complete. ' +
    'Review the context packet before starting a new session.'
  );

  // Refresh the status bar to reflect updated workspace state.
  await refreshWitnessStatusBar();
}
