import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { performProjectInit } from './initProject';
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
import {
  detectWitnessProjectMigrationNeed,
  migrateWitnessProjectSupportFiles,
} from '../core/witnessProjectMigration';

/**
 * Implementation of `Witness: Start with Witness` (v7.1).
 *
 * One-command beginner entry point:
 * initialize Witness if needed, ask for the task goal, create a tracking
 * session, and open the copy-ready coding-agent prompt. This command does not
 * open onboarding, call an LLM, or inject prompts into any coding agent.
 */
export async function startWithWitness(
  context: vscode.ExtensionContext
): Promise<void> {
  const elapsed = createCommandTimer();

  let initializedProject = false;
  let activeSessionCreated = false;
  let usedGenericGoalWarning = false;
  let promptOpened = false;
  let copiedToClipboard = false;
  let taskGoal = '';
  let sessionId: string | null = null;
  let cancelledAt: string | null = null;
  let upgradedProjectFiles = false;

  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage(
        'Witness: Open a workspace folder before starting with Witness.'
      );
      return;
    }

    const witnessRoot = getWitnessRoot(workspaceRoot);
    const witnessIndex = vscode.Uri.joinPath(witnessRoot, 'index.md');

    try {
      await vscode.workspace.fs.stat(witnessIndex);
    } catch {
      await performProjectInit(context, witnessRoot);
      initializedProject = true;
    }

    if (!initializedProject) {
      const migrationChoice = await promptForSupportFileUpgrade(witnessRoot);
      if (migrationChoice === 'cancel') {
        cancelledAt = 'project-upgrade';
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.start_with_witness.started',
          commandId: 'witness.startWithWitness',
          sessionId: null,
          status: 'cancelled',
          durationMs: elapsed(),
          attributes: {
            initialized_project: initializedProject,
            upgraded_project_files: upgradedProjectFiles,
            active_session_created: false,
            goal_length: 0,
            used_generic_goal_warning: usedGenericGoalWarning,
            prompt_opened: false,
            copied_to_clipboard: false,
            completed: false,
            cancelled_at: cancelledAt,
          },
        });
        return;
      }

      if (migrationChoice === 'upgrade') {
        await migrateWitnessProjectSupportFiles(context, witnessRoot);
        upgradedProjectFiles = true;
        vscode.window.showInformationMessage(
          'Witness: Safe support files upgraded. Starting task...'
        );
      }
    }

    const goalResult = await promptForTaskGoal();
    usedGenericGoalWarning = goalResult.usedGenericGoalWarning;
    if (!goalResult.taskGoal) {
      cancelledAt = 'task-goal';
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.start_with_witness.started',
        commandId: 'witness.startWithWitness',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          initialized_project: initializedProject,
          upgraded_project_files: upgradedProjectFiles,
          active_session_created: false,
          goal_length: 0,
          used_generic_goal_warning: usedGenericGoalWarning,
          prompt_opened: false,
          copied_to_clipboard: false,
          completed: false,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    taskGoal = goalResult.taskGoal;

    const sessionResult = await createTrackingSession(context, witnessRoot, taskGoal);
    sessionId = sessionResult.sessionId;
    activeSessionCreated = true;

    const presented = await openStartPrompt(
      taskGoal,
      'Paste this prompt into your coding agent. After it proposes a plan, approve or adjust it, then code normally. When meaningful work is done, run `Witness: Save Progress`.'
    );
    promptOpened = presented.promptOpened;
    copiedToClipboard = presented.copiedToClipboard;

    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.start_with_witness.started',
      commandId: 'witness.startWithWitness',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, sessionResult.sessionFileUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        initialized_project: initializedProject,
        upgraded_project_files: upgradedProjectFiles,
        active_session_created: activeSessionCreated,
        goal_length: taskGoal.length,
        used_generic_goal_warning: usedGenericGoalWarning,
        prompt_opened: promptOpened,
        copied_to_clipboard: copiedToClipboard,
        completed: true,
        cancelled_at: null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.start_with_witness.started',
      commandId: 'witness.startWithWitness',
      sessionId,
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        initialized_project: initializedProject,
        upgraded_project_files: upgradedProjectFiles,
        active_session_created: activeSessionCreated,
        goal_length: taskGoal.length,
        used_generic_goal_warning: usedGenericGoalWarning,
        prompt_opened: promptOpened,
        copied_to_clipboard: copiedToClipboard,
        completed: false,
        cancelled_at: cancelledAt,
      },
    });
    vscode.window.showErrorMessage(`Witness: Start with Witness failed — ${message}`);
  }
}

type SupportFileUpgradeChoice = 'upgrade' | 'skip' | 'cancel';

async function promptForSupportFileUpgrade(
  witnessRoot: vscode.Uri
): Promise<SupportFileUpgradeChoice> {
  const migrationNeed = await detectWitnessProjectMigrationNeed(witnessRoot);
  if (!migrationNeed.migrationNeeded) {
    return 'skip';
  }

  const choice = await vscode.window.showWarningMessage(
    'Witness: This project uses older Witness support files. Upgrade safe Witness support files before starting?',
    { modal: true },
    'Upgrade and Start',
    'Start Without Upgrade',
    'Cancel'
  );

  if (choice === 'Upgrade and Start') {
    return 'upgrade';
  }

  if (choice === 'Start Without Upgrade') {
    return 'skip';
  }

  return 'cancel';
}
