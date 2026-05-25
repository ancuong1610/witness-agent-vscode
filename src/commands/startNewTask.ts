import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { computeWorkspaceStatus } from '../core/workspaceStatus';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import {
  createTrackingSession,
  openStartPrompt,
  promptForTaskGoal,
} from './startTrackingTask';

interface RestartTelemetryState {
  hadActiveSession: boolean;
  openedCurrentSession: boolean;
  checkpointRequested: boolean;
  checkpointCommandInvoked: boolean;
  activeSessionCreated: boolean;
  goalLength: number;
  usedGenericGoalWarning: boolean;
  promptOpened: boolean;
  copiedToClipboard: boolean;
  completed: boolean;
  cancelledAt: string | null;
}

interface ActiveSessionChoice extends vscode.QuickPickItem {
  action: 'start-new-task' | 'open-current-session' | 'cancel';
}

interface CheckpointChoice extends vscode.QuickPickItem {
  action: 'create-checkpoint' | 'skip-checkpoint' | 'cancel';
}

const ACTIVE_SESSION_CHOICES: ActiveSessionChoice[] = [
  {
    label: 'Start New Task',
    description: 'Preserve the current session and start a clean new task',
    action: 'start-new-task',
  },
  {
    label: 'Open Current Session',
    description: 'Review the active session without starting a new task',
    action: 'open-current-session',
  },
  {
    label: 'Cancel',
    description: 'Keep tracking the current task',
    action: 'cancel',
  },
];

const CHECKPOINT_CHOICES: CheckpointChoice[] = [
  {
    label: 'Create Checkpoint First',
    description: 'Run the existing checkpoint command before starting the new task',
    action: 'create-checkpoint',
  },
  {
    label: 'Skip Checkpoint',
    description: 'Start the new task now and leave current artifacts unchanged',
    action: 'skip-checkpoint',
  },
  {
    label: 'Cancel',
    description: 'Keep tracking the current task',
    action: 'cancel',
  },
];

function createTelemetryState(): RestartTelemetryState {
  return {
    hadActiveSession: false,
    openedCurrentSession: false,
    checkpointRequested: false,
    checkpointCommandInvoked: false,
    activeSessionCreated: false,
    goalLength: 0,
    usedGenericGoalWarning: false,
    promptOpened: false,
    copiedToClipboard: false,
    completed: false,
    cancelledAt: null,
  };
}

function telemetryAttributes(state: RestartTelemetryState): Record<string, unknown> {
  return {
    had_active_session: state.hadActiveSession,
    opened_current_session: state.openedCurrentSession,
    checkpoint_requested: state.checkpointRequested,
    checkpoint_command_invoked: state.checkpointCommandInvoked,
    active_session_created: state.activeSessionCreated,
    goal_length: state.goalLength,
    used_generic_goal_warning: state.usedGenericGoalWarning,
    prompt_opened: state.promptOpened,
    copied_to_clipboard: state.copiedToClipboard,
    completed: state.completed,
    cancelled_at: state.cancelledAt,
  };
}

async function openActiveSessionFile(
  witnessRoot: vscode.Uri,
  activeSessionId: string
): Promise<boolean> {
  const sessionFile = vscode.Uri.joinPath(
    witnessRoot,
    'sessions',
    `${activeSessionId}.md`
  );

  try {
    await vscode.workspace.fs.stat(sessionFile);
    const doc = await vscode.workspace.openTextDocument(sessionFile);
    await vscode.window.showTextDocument(doc, { preview: false });
    return true;
  } catch {
    vscode.window.showWarningMessage(
      `Witness: Active session file was not found: .witness/sessions/${activeSessionId}.md`
    );
    return false;
  }
}

/**
 * Implementation of `Witness: Start New Task` (v7.3).
 *
 * Safe recovery/switching flow for users who want to stop tracking one work
 * block and begin another. Existing session files are preserved; creating the
 * new task only updates the active-session pointer through the shared session
 * creation helper.
 */
export async function startNewTask(context: vscode.ExtensionContext): Promise<void> {
  const elapsed = createCommandTimer();
  const telemetry = createTelemetryState();
  let sessionId: string | null = null;
  let activeSessionId: string | null = null;
  let workspaceRoot: vscode.Uri | undefined;

  try {
    workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage(
        'Witness: Open a workspace folder before starting a new task.'
      );
      return;
    }

    const witnessRoot = getWitnessRoot(workspaceRoot);
    const witnessIndex = vscode.Uri.joinPath(witnessRoot, 'index.md');

    try {
      await vscode.workspace.fs.stat(witnessIndex);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: Witness is not enabled in this project. Run "Witness: Start with Witness" first.'
      );
      return;
    }

    try {
      const status = await computeWorkspaceStatus(workspaceRoot);
      activeSessionId = status.activeSessionId;
    } catch {
      activeSessionId = null;
    }

    if (!activeSessionId) {
      activeSessionId = (await getCurrentSessionId(witnessRoot)) ?? null;
    }

    telemetry.hadActiveSession = activeSessionId !== null;

    if (activeSessionId) {
      const choice = await vscode.window.showQuickPick(ACTIVE_SESSION_CHOICES, {
        title: 'Witness: Start a new task and keep the current session archived?',
        placeHolder: 'Choose what to do with the active session',
      });

      if (!choice || choice.action === 'cancel') {
        telemetry.cancelledAt = 'active-session-choice';
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.task_tracking.restarted',
          commandId: 'witness.startNewTask',
          sessionId: activeSessionId,
          status: 'cancelled',
          durationMs: elapsed(),
          attributes: telemetryAttributes(telemetry),
        });
        return;
      }

      if (choice.action === 'open-current-session') {
        telemetry.openedCurrentSession = await openActiveSessionFile(
          witnessRoot,
          activeSessionId
        );
        telemetry.completed = telemetry.openedCurrentSession;
        telemetry.cancelledAt = telemetry.openedCurrentSession
          ? null
          : 'open-current-session';
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.task_tracking.restarted',
          commandId: 'witness.startNewTask',
          sessionId: activeSessionId,
          status: telemetry.openedCurrentSession ? 'success' : 'cancelled',
          durationMs: elapsed(),
          attributes: telemetryAttributes(telemetry),
        });
        return;
      }
    }

    const goalResult = await promptForTaskGoal();
    telemetry.usedGenericGoalWarning = goalResult.usedGenericGoalWarning;
    if (!goalResult.taskGoal) {
      telemetry.cancelledAt = 'task-goal';
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.task_tracking.restarted',
        commandId: 'witness.startNewTask',
        sessionId: activeSessionId,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: telemetryAttributes(telemetry),
      });
      return;
    }

    const taskGoal = goalResult.taskGoal;
    telemetry.goalLength = taskGoal.length;

    if (activeSessionId) {
      const checkpointChoice = await vscode.window.showQuickPick(CHECKPOINT_CHOICES, {
        title: 'Witness: Create a checkpoint before starting the new task?',
        placeHolder: 'Choose whether to checkpoint first',
      });

      if (!checkpointChoice || checkpointChoice.action === 'cancel') {
        telemetry.cancelledAt = 'checkpoint-choice';
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.task_tracking.restarted',
          commandId: 'witness.startNewTask',
          sessionId: activeSessionId,
          status: 'cancelled',
          durationMs: elapsed(),
          attributes: telemetryAttributes(telemetry),
        });
        return;
      }

      if (checkpointChoice.action === 'create-checkpoint') {
        telemetry.checkpointRequested = true;
        try {
          await vscode.commands.executeCommand('witness.createCheckpoint');
          telemetry.checkpointCommandInvoked = true;
        } catch {
          telemetry.checkpointCommandInvoked = false;
        }
      }
    }

    const sessionResult = await createTrackingSession(context, witnessRoot, taskGoal);
    sessionId = sessionResult.sessionId;
    telemetry.activeSessionCreated = true;

    const presented = await openStartPrompt(
      taskGoal,
      'Witness: New task started. Paste the prompt into your coding agent.'
    );
    telemetry.promptOpened = presented.promptOpened;
    telemetry.copiedToClipboard = presented.copiedToClipboard;
    telemetry.completed = true;

    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.task_tracking.restarted',
      commandId: 'witness.startNewTask',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, sessionResult.sessionFileUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: telemetryAttributes(telemetry),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: workspaceRoot ?? getWorkspaceRoot(),
      eventName: 'witness.task_tracking.restarted',
      commandId: 'witness.startNewTask',
      sessionId,
      status: 'error',
      durationMs: elapsed(),
      attributes: telemetryAttributes({
        ...telemetry,
        completed: false,
        cancelledAt: telemetry.cancelledAt ?? 'unhandled-error',
      }),
    });
    vscode.window.showErrorMessage(`Witness: Start New Task failed — ${message}`);
  }
}
