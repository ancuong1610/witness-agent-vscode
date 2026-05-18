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
function isVagueGoal(goal: string): boolean {
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

    // 4. Prompt for the task goal, with validation loop.
    //    The loop allows the user to edit the goal if it is too vague.
    while (true) {
      const input = await vscode.window.showInputBox({
        prompt: 'What are you working on?',
        placeHolder: 'e.g. Implement GitHub OAuth login and update auth tests.',
        ignoreFocusOut: true,
      });

      // Empty or cancelled — exit silently.
      if (input === undefined || input.trim().length === 0) {
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.task_tracking.started',
          commandId: 'witness.startTrackingTask',
          sessionId: null,
          status: 'cancelled',
          durationMs: elapsed(),
          attributes: {
            previous_session_id: existingSessionId ?? null,
            used_generic_goal_warning: false,
            prompt_opened: false,
            copied_to_clipboard: false,
          },
        });
        return;
      }

      // Vague goal — offer the user a choice.
      if (isVagueGoal(input)) {
        const choice = await vscode.window.showWarningMessage(
          'Witness: A bit more detail helps Witness track your work.',
          { modal: true },
          'Continue Anyway',
          'Edit Goal',
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
              previous_session_id: existingSessionId ?? null,
              used_generic_goal_warning: true,
              prompt_opened: false,
              copied_to_clipboard: false,
            },
          });
          return;
        }

        if (choice === 'Edit Goal') {
          // Loop back to the input prompt.
          usedGenericGoalWarning = true;
          continue;
        }

        // 'Continue Anyway' — accept the vague goal.
        usedGenericGoalWarning = true;
        taskGoal = input.trim();
        break;
      }

      // Valid goal — accept it.
      taskGoal = input.trim();
      break;
    }

    // 5. Generate a new session ID based on the local date.
    const newSessionId = await generateNewSessionId(witnessRoot, new Date());
    sessionId = newSessionId;

    // 6. Build the started-at local timestamp.
    const startedAt = formatLocalTimestamp();

    // 7. Load and populate the session template.
    //    Placeholder substitution mirrors witness.startSession exactly so that
    //    sessions created by this command are identical in format.
    let content = await loadTemplate(context, 'session-template.md');
    content = replaceAll(content, '{{SESSION_ID}}', newSessionId);
    content = replaceFirst(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', startedAt);
    content = replaceAll(content, '{{SESSION_GOAL}}', taskGoal);

    // 8. Write the session file.
    const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
    await ensureDir(sessionsDir);
    const sessionFileUri = vscode.Uri.joinPath(sessionsDir, `${newSessionId}.md`);
    const written = await writeFileIfMissing(sessionFileUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Start Tracking failed — session file already exists: ${sessionFileUri.fsPath}`
      );
      return;
    }

    // 9. Ensure the telemetry directory for this session exists.
    const telemetryDir = vscode.Uri.joinPath(witnessRoot, 'telemetry', newSessionId);
    await ensureDir(telemetryDir);
    const gitkeepUri = vscode.Uri.joinPath(telemetryDir, '.gitkeep');
    await vscode.workspace.fs.writeFile(gitkeepUri, new TextEncoder().encode(''));

    // 10. Update the .current-session pointer.
    await setCurrentSessionId(witnessRoot, newSessionId);

    // 11. Build the copy-ready coding-agent prompt.
    const promptText = generateStartTaskPrompt({ taskGoal });

    // 12 & 13. Open the prompt tab and offer the Copy Prompt notification action.
    //          Delegated to the shared presentPrompt helper so the open-tab +
    //          copy pattern is not duplicated across beginner commands.
    const presented = await presentPrompt(
      promptText,
      `Witness: Tracking "${newSessionId}". Paste the prompt into your coding agent.`
    );
    promptOpened = presented.promptOpened;
    copiedToClipboard = presented.copiedToClipboard;

    // 14. Emit success telemetry.
    //     Task goal text is not stored. Only its length and boolean flags are recorded.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.task_tracking.started',
      commandId: 'witness.startTrackingTask',
      sessionId: newSessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, sessionFileUri)],
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
