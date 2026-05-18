// ---------------------------------------------------------------------------
// resumeWithWitness.ts — Witness: Resume with Witness command (v5.2).
// ---------------------------------------------------------------------------
//
// Beginner-friendly resume helper. Generates a copy-ready coding-agent prompt
// pre-loaded with the standard Witness read set. The user pastes the prompt
// into any coding agent to resume their work with full Witness context.
//
// Workflow:
//   1. Guard: open workspace + initialized project
//   2. Detect latest context packet (best-effort; informational only)
//   3. Build prompt — if a context packet is found, append its relative path
//   4. Open unsaved markdown tab via presentPrompt
//   5. Offer Copy Prompt via notification
//
// Design invariants:
//   - Does NOT require an active session.
//   - Does NOT inject the prompt into any coding agent automatically.
//   - Does NOT read raw telemetry content.
//   - Does NOT scan all .witness/ files.
//   - Uses the fixed default read set regardless of whether a packet exists.
//   - Context packet detection is best-effort; failures are silent.
//   - No LLM calls. No raw artifact content in telemetry.
//   - One telemetry event emitted on exit regardless of path taken.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';
import { presentPrompt } from '../core/promptPresenter';
import { generateResumePrompt } from '../core/agentPromptGenerator';

// ---------------------------------------------------------------------------
// Context packet detection
// ---------------------------------------------------------------------------

/** Pattern matching session-level context packet files. */
const CONTEXT_PACKET_RE = /-context-packet-\d+\.md$/;

/**
 * Returns the filename (not full path) of the most recently modified context
 * packet in `.witness/sessions/`, or `null` if none exists or the scan fails.
 *
 * Best-effort: all errors are silently swallowed.
 */
async function findLatestContextPacket(
  witnessRoot: vscode.Uri
): Promise<string | null> {
  try {
    const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
    const entries = await vscode.workspace.fs.readDirectory(sessionsDir);

    let latestName: string | null = null;
    let latestMtime = 0;

    for (const [name, fileType] of entries) {
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      if (!CONTEXT_PACKET_RE.test(name)) {
        continue;
      }

      const uri = vscode.Uri.joinPath(sessionsDir, name);
      try {
        const st = await vscode.workspace.fs.stat(uri);
        if (st.mtime > latestMtime) {
          latestMtime = st.mtime;
          latestName = name;
        }
      } catch {
        // Stat failure — skip this entry.
      }
    }

    return latestName;
  } catch {
    return null;
  }
}

/** Workspace-relative prefix for all context packet references. */
const SESSIONS_REL_PREFIX = '.witness/sessions/';

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Resume with Witness` command (v5.1b).
 *
 * Generates a copy-ready coding-agent prompt using the standard Witness
 * default read set. The user pastes this prompt into any AI coding agent
 * (Claude, Copilot, Codex, Cursor, etc.) to begin a new session with full
 * Witness context pre-loaded.
 *
 * If a reviewed context packet is found in `.witness/sessions/`, its relative
 * path is appended to the prompt body and noted in the notification message.
 * The default read set is always included regardless.
 *
 * Emits telemetry event `witness.resume_prompt.generated`.
 */
export async function resumeWithWitness(
  _context: vscode.ExtensionContext
): Promise<void> {
  const elapsed = createCommandTimer();

  // Telemetry state.
  let contextPacketDetected = false;
  let promptOpened = false;
  let copiedToClipboard = false;

  try {
    // -------------------------------------------------------------------------
    // 1. Require an open workspace folder.
    // -------------------------------------------------------------------------

    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.resume_prompt.generated',
        commandId: 'witness.resumeWithWitness',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          context_packet_detected: false,
          prompt_opened: false,
          copied_to_clipboard: false,
          completed: false,
          cancelled_at: 'no-workspace',
        },
      });
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
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.resume_prompt.generated',
        commandId: 'witness.resumeWithWitness',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          context_packet_detected: false,
          prompt_opened: false,
          copied_to_clipboard: false,
          completed: false,
          cancelled_at: 'no-witness-dir',
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 3. Detect the latest context packet (informational only).
    //    The default read set is always included regardless of this result.
    // -------------------------------------------------------------------------

    const latestPacket = await findLatestContextPacket(witnessRoot);
    contextPacketDetected = latestPacket !== null;

    // -------------------------------------------------------------------------
    // 4. Build the copy-ready prompt.
    //    When a context packet is found, its relative path is appended so the
    //    coding agent can locate it without manual input.
    // -------------------------------------------------------------------------

    const contextPacketPath = latestPacket !== null
      ? `${SESSIONS_REL_PREFIX}${latestPacket}`
      : null;
    const promptContent = generateResumePrompt({ contextPacketPath });

    // -------------------------------------------------------------------------
    // 5. Build the notification message.
    //    When a context packet is found, note it explicitly so the user knows
    //    it was detected and included in the prompt.
    // -------------------------------------------------------------------------

    let notificationMessage: string;
    if (contextPacketDetected && contextPacketPath !== null) {
      notificationMessage =
        `Witness: Ready to resume. ` +
        `Optional reviewed context packet detected: ${contextPacketPath}. ` +
        'Paste the prompt into your coding agent.';
    } else {
      notificationMessage =
        'Witness: Ready to resume. Paste the prompt into your coding agent.';
    }

    // -------------------------------------------------------------------------
    // 6. Open the prompt tab and offer the Copy Prompt action.
    //    Delegated to the shared presentPrompt helper.
    // -------------------------------------------------------------------------

    const presented = await presentPrompt(promptContent, notificationMessage);
    promptOpened = presented.promptOpened;
    copiedToClipboard = presented.copiedToClipboard;

    // -------------------------------------------------------------------------
    // 7. Emit success telemetry.
    //    Prompt text is not stored. Only boolean flags are recorded.
    // -------------------------------------------------------------------------

    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.resume_prompt.generated',
      commandId: 'witness.resumeWithWitness',
      sessionId: null,
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        context_packet_detected: contextPacketDetected,
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
      eventName: 'witness.resume_prompt.generated',
      commandId: 'witness.resumeWithWitness',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        context_packet_detected: contextPacketDetected,
        prompt_opened: promptOpened,
        copied_to_clipboard: copiedToClipboard,
        completed: false,
        cancelled_at: 'unhandled-error',
      },
    });
    vscode.window.showErrorMessage(`Witness: Resume with Witness failed — ${message}`);
  }
}
