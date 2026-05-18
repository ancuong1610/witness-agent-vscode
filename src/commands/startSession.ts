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

// ---------------------------------------------------------------------------
// Substitution helper
// ---------------------------------------------------------------------------

/**
 * Replaces ALL occurrences of `placeholder` in `content` with `value`.
 * Uses plain string splitting (no regex) to avoid issues with special characters
 * in placeholder or value strings.
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
 * Implementation of the `Witness: Start Session` command.
 *
 * Prompts the user for a session goal, generates a session ID, writes a new
 * session record to `.witness/sessions/<session-id>.md`, creates the
 * corresponding telemetry directory, updates the `.current-session` pointer,
 * and opens the new file in the editor.
 */
export async function startSession(context: vscode.ExtensionContext): Promise<void> {
  const elapsed = createCommandTimer();
  try {
    // 1. Require an open workspace folder.
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      return;
    }

    // 2. Require .witness/ to exist (i.e. project already initialized).
    const witnessRoot = getWitnessRoot(workspaceRoot);
    try {
      await vscode.workspace.fs.stat(witnessRoot);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: Run "Witness: Initialize Project" first.'
      );
      return;
    }

    // 3. Warn if a session is already active.
    const existingSessionId = await getCurrentSessionId(witnessRoot);
    if (existingSessionId !== undefined) {
      const choice = await vscode.window.showWarningMessage(
        `Witness: Session ${existingSessionId} is already active. Start a new session anyway?`,
        { modal: true },
        'Start new session',
        'Cancel'
      );
      if (!choice || choice === 'Cancel') {
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.session.started',
          commandId: 'witness.startSession',
          sessionId: null,
          status: 'cancelled',
          durationMs: elapsed(),
          attributes: { previous_session_id: existingSessionId ?? null },
        });
        return;
      }
    }

    // 4. Prompt the user for a session goal.
    const goal = await vscode.window.showInputBox({
      prompt: 'What is the goal of this Copilot session?',
      placeHolder: 'e.g. Implement the assessRisk command',
      ignoreFocusOut: true,
    });

    if (goal === undefined || goal.trim().length === 0) {
      vscode.window.showInformationMessage('Witness: Start Session cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.session.started',
        commandId: 'witness.startSession',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { previous_session_id: existingSessionId ?? null },
      });
      return;
    }

    // 5. Generate a new session ID based on the local date.
    const sessionId = await generateNewSessionId(witnessRoot, new Date());

    // 6. Build the started-at local timestamp.
    const startedAt = formatLocalTimestamp();

    // 7. Load the session template.
    let content = await loadTemplate(context, 'session-template.md');

    // 8. Substitute placeholders using the exact strings found in the template.
    //    Verified template placeholders:
    //      {{SESSION_ID}}               — appears twice (session ID field + handover link)
    //      {{YYYY-MM-DDTHH:MM:SSZ}}     — appears twice (Started At, then Ended At)
    //      {{SESSION_GOAL}}             — appears once (Goal section)
    //    Replace SESSION_ID everywhere, Started-At timestamp first occurrence only,
    //    SESSION_GOAL everywhere. Leave the second {{YYYY-MM-DDTHH:MM:SSZ}} (Ended At) intact.
    content = replaceAll(content, '{{SESSION_ID}}', sessionId);
    content = replaceFirst(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', startedAt);
    content = replaceAll(content, '{{SESSION_GOAL}}', goal.trim());

    // 9. Write the session file.
    const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
    await ensureDir(sessionsDir);
    const sessionFileUri = vscode.Uri.joinPath(sessionsDir, `${sessionId}.md`);
    const written = await writeFileIfMissing(sessionFileUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Start Session failed — Session file already exists: ${sessionFileUri.fsPath}`
      );
      return;
    }

    // 10. Ensure the telemetry directory for this session exists.
    const telemetryDir = vscode.Uri.joinPath(witnessRoot, 'telemetry', sessionId);
    await ensureDir(telemetryDir);
    const gitkeepUri = vscode.Uri.joinPath(telemetryDir, '.gitkeep');
    await vscode.workspace.fs.writeFile(gitkeepUri, new TextEncoder().encode(''));

    // 11. Update the .current-session pointer.
    await setCurrentSessionId(witnessRoot, sessionId);

    // 12. Open the new session file in the editor.
    const doc = await vscode.workspace.openTextDocument(sessionFileUri);
    await vscode.window.showTextDocument(doc);

    // 13. Confirm success.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.session.started',
      commandId: 'witness.startSession',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, sessionFileUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        previous_session_id: existingSessionId ?? null,
        goal_length: goal.trim().length,
        template_loaded: true,
      },
    });
    vscode.window.showInformationMessage(`Witness: Session ${sessionId} started.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.session.started',
      commandId: 'witness.startSession',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(`Witness: Start Session failed — ${message}`);
  }
}
