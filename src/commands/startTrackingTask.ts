import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, writeFileIfMissing } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import {
  getCurrentSessionId,
  generateNewSessionId,
  setCurrentSessionId,
} from '../core/sessionRegistry';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalTimestamp } from '../core/time';
import { presentPrompt } from '../core/promptPresenter';
import { generateStartTaskPrompt } from '../core/agentPromptGenerator';
import { refreshWitnessStatusBar } from '../core/statusBar';

// ---------------------------------------------------------------------------
// Generic-goal detection
// ---------------------------------------------------------------------------

/**
 * A small set of normalized goal strings that are too vague to be useful as
 * Witness task goals. These are checked after the length guard.
 */
const GENERIC_GOAL_TERMS = new Set([
  'work',
  'continue',
  'fix',
  'fix stuff',
  'stuff',
  'coding',
  'misc',
  'other',
  'dev',
  'develop',
  'test',
]);

/**
 * Returns true if `goal` is too short or matches a known-generic term.
 * Used to trigger the "A bit more detail helps" warning dialog.
 *
 * @param goal - The raw task goal string entered by the user (not yet trimmed).
 */
export function isVagueGoal(goal: string): boolean {
  const trimmed = goal.trim();
  if (trimmed.length < 10) {
    return true;
  }
  return GENERIC_GOAL_TERMS.has(trimmed.toLowerCase());
}

// ---------------------------------------------------------------------------
// Substitution helpers (local to this module)
// ---------------------------------------------------------------------------

/**
 * Replaces ALL occurrences of `placeholder` in `content` with `value`.
 */
function replaceAll(content: string, placeholder: string, value: string): string {
  return content.split(placeholder).join(value);
}

/**
 * Replaces only the FIRST occurrence of `placeholder` in `content` with
 * `value`. Returns `content` unchanged if `placeholder` is not found.
 */
function replaceFirst(content: string, placeholder: string, value: string): string {
  const index = content.indexOf(placeholder);
  if (index === -1) {
    return content;
  }
  return content.slice(0, index) + value + content.slice(index + placeholder.length);
}

// ---------------------------------------------------------------------------
// Shared beginner tracking helpers
// ---------------------------------------------------------------------------

export interface TaskGoalPromptResult {
  taskGoal: string | null;
  usedGenericGoalWarning: boolean;
}

export interface TrackingSessionResult {
  sessionId: string;
  sessionFileUri: vscode.Uri;
}

export interface StartPromptResult {
  promptOpened: boolean;
  copiedToClipboard: boolean;
}

/**
 * Prompts for a task goal using the beginner validation flow shared by
 * `Witness: Start Tracking This Task` and `Witness: Start with Witness`.
 */
export async function promptForTaskGoal(): Promise<TaskGoalPromptResult> {
  let usedGenericGoalWarning = false;

  while (true) {
    const input = await vscode.window.showInputBox({
      prompt: 'What are you working on?',
      placeHolder: 'e.g. Implement GitHub OAuth login and update auth tests.',
      ignoreFocusOut: true,
    });

    if (input === undefined || input.trim().length === 0) {
      return { taskGoal: null, usedGenericGoalWarning };
    }

    if (isVagueGoal(input)) {
      const choice = await vscode.window.showWarningMessage(
        'Witness: A bit more detail helps Witness track your work.',
        { modal: true },
        'Continue Anyway',
        'Edit Goal',
        'Cancel'
      );

      if (!choice || choice === 'Cancel') {
        return { taskGoal: null, usedGenericGoalWarning: true };
      }

      if (choice === 'Edit Goal') {
        usedGenericGoalWarning = true;
        continue;
      }

      return {
        taskGoal: input.trim(),
        usedGenericGoalWarning: true,
      };
    }

    return {
      taskGoal: input.trim(),
      usedGenericGoalWarning,
    };
  }
}

/**
 * Creates a Witness tracking session using the same template and pointer
 * update behavior as the original `Witness: Start Tracking This Task` command.
 */
export async function createTrackingSession(
  context: vscode.ExtensionContext,
  witnessRoot: vscode.Uri,
  taskGoal: string
): Promise<TrackingSessionResult> {
  const newSessionId = await generateNewSessionId(witnessRoot, new Date());
  const startedAt = formatLocalTimestamp();

  let content = await loadTemplate(context, 'session-template.md');
  content = replaceAll(content, '{{SESSION_ID}}', newSessionId);
  content = replaceFirst(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', startedAt);
  content = replaceAll(content, '{{SESSION_GOAL}}', taskGoal);

  const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
  await ensureDir(sessionsDir);
  const sessionFileUri = vscode.Uri.joinPath(sessionsDir, `${newSessionId}.md`);
  const written = await writeFileIfMissing(sessionFileUri, content);
  if (!written) {
    throw new Error(`session file already exists: ${sessionFileUri.fsPath}`);
  }

  const telemetryDir = vscode.Uri.joinPath(witnessRoot, 'telemetry', newSessionId);
  await ensureDir(telemetryDir);
  const gitkeepUri = vscode.Uri.joinPath(telemetryDir, '.gitkeep');
  await vscode.workspace.fs.writeFile(gitkeepUri, new TextEncoder().encode(''));

  await setCurrentSessionId(witnessRoot, newSessionId);
  await refreshWitnessStatusBar();

  return {
    sessionId: newSessionId,
    sessionFileUri,
  };
}

/**
 * Generates and presents the shared start-task coding-agent prompt.
 */
export async function openStartPrompt(
  taskGoal: string,
  notificationMessage: string
): Promise<StartPromptResult> {
  const promptText = generateStartTaskPrompt({ taskGoal });
  return presentPrompt(promptText, notificationMessage);
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Start Tracking This Task` command (v5.2).
 *
 * Beginner-friendly entry point for starting a Witness session. Asks only
 * "What are you working on?" and produces:
 *   1. A Witness session record in `.witness/sessions/` (using the same
 *      session template and logic as `witness.startSession`).
 *   2. An unsaved markdown editor tab containing a copy-ready coding-agent
 *      prompt with the task goal substituted.
 *   3. A VS Code notification offering a "Copy Prompt" action.
 *
 * Does not open the session file in the editor.
 * Does not update `current-state.md` automatically (deferred to v5.1b+).
 * Does not inject context into any coding agent.
 *
 * Note: A Witness session is a project work record, not a Copilot/Claude/Codex
 * chat session. Starting a new Witness session does not require opening a new
 * coding-agent chat.
 *
 * Emits telemetry event `witness.task_tracking.started`.
 */
export async function startTrackingTask(context: vscode.ExtensionContext): Promise<void> {
  const elapsed = createCommandTimer();

  // Telemetry state — accumulated during command execution.
  let usedGenericGoalWarning = false;
  let promptOpened = false;
  let copiedToClipboard = false;
  let taskGoal = '';
  let sessionId: string | null = null;
  let existingSessionId: string | undefined;

  try {
    // 1. Require an open workspace folder.
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      return;
    }

    // 2. Require .witness/ to exist (project must be enabled first).
    const witnessRoot = getWitnessRoot(workspaceRoot);
    try {
      await vscode.workspace.fs.stat(witnessRoot);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: Run "Witness: Enable for This Project" first.'
      );
      return;
    }

    // 3. Warn if a task is already being tracked in this project.
    existingSessionId = await getCurrentSessionId(witnessRoot);
    if (existingSessionId !== undefined) {
      const choice = await vscode.window.showWarningMessage(
        'Witness: You are already tracking a task in this project. Start tracking a new task anyway?',
        { modal: true },
        'Start new task',
        'Cancel'
      );
      if (!choice || choice === 'Cancel') {
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.task_tracking.started',
          commandId: 'witness.startTrackingTask',
          sessionId: null,
          status: 'cancelled',
          durationMs: elapsed(),
          attributes: {
            previous_session_id: existingSessionId,
            used_generic_goal_warning: false,
            prompt_opened: false,
            copied_to_clipboard: false,
          },
        });
        return;
      }
    }

    const goalResult = await promptForTaskGoal();
    usedGenericGoalWarning = goalResult.usedGenericGoalWarning;
    if (!goalResult.taskGoal) {
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.task_tracking.started',
        commandId: 'witness.startTrackingTask',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          previous_session_id: existingSessionId ?? null,
          used_generic_goal_warning: usedGenericGoalWarning,
          prompt_opened: false,
          copied_to_clipboard: false,
        },
      });
      return;
    }
    taskGoal = goalResult.taskGoal;

    const sessionResult = await createTrackingSession(context, witnessRoot, taskGoal);
    sessionId = sessionResult.sessionId;

    // Open the prompt tab and offer the Copy Prompt notification action.
    //          Delegated to the shared presentPrompt helper so the open-tab +
    //          copy pattern is not duplicated across beginner commands.
    const presented = await openStartPrompt(
      taskGoal,
      'Paste this prompt into your coding agent. After it proposes a plan, approve or adjust it, then code normally. When meaningful work is done, run `Witness: Save Progress`.'
    );
    promptOpened = presented.promptOpened;
    copiedToClipboard = presented.copiedToClipboard;

    // 14. Emit success telemetry.
    //     Task goal text is not stored. Only its length and boolean flags are recorded.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.task_tracking.started',
      commandId: 'witness.startTrackingTask',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, sessionResult.sessionFileUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        previous_session_id: existingSessionId ?? null,
        goal_length: taskGoal.length,
        used_generic_goal_warning: usedGenericGoalWarning,
        prompt_opened: promptOpened,
        copied_to_clipboard: copiedToClipboard,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.task_tracking.started',
      commandId: 'witness.startTrackingTask',
      sessionId,
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        previous_session_id: existingSessionId ?? null,
        goal_length: taskGoal.length,
        used_generic_goal_warning: usedGenericGoalWarning,
        prompt_opened: promptOpened,
        copied_to_clipboard: copiedToClipboard,
      },
    });
    vscode.window.showErrorMessage(`Witness: Start Tracking failed — ${message}`);
  }
}
