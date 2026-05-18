// ---------------------------------------------------------------------------
// promptPresenter.ts — Shared prompt tab + clipboard helper (v5.1b).
// ---------------------------------------------------------------------------
//
// Opens a copy-ready prompt in an unsaved markdown editor tab and offers a
// one-click "Copy Prompt" notification action. Shared between
// witness.startTrackingTask and witness.resumeWithWitness to avoid
// duplicating the open-tab + copy pattern.
//
// Design invariants:
//   - Does not write any file to disk.
//   - Does not inject content into any coding agent automatically.
//   - Presentation failures are non-fatal: the function returns the state
//     accumulated before the failure rather than throwing.
//   - No LLM calls.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result returned by {@link presentPrompt}.
 */
export interface PromptPresentResult {
  /** True if the unsaved markdown tab was opened successfully. */
  promptOpened: boolean;
  /** True if the user clicked "Copy Prompt" and the text was written to the clipboard. */
  copiedToClipboard: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens `promptContent` in an unsaved markdown editor tab, then shows a VS Code
 * notification offering a one-click "Copy Prompt" action.
 *
 * The tab is opened first so the user can see and read the prompt. The
 * notification appears immediately after. If the user clicks "Copy Prompt",
 * `promptContent` is written to the system clipboard and a second confirmation
 * notification is shown.
 *
 * Plain markdown tabs do not support embedded action buttons, so the copy
 * action is delivered via the VS Code notification API rather than a button
 * inside the document.
 *
 * @param promptContent       - The full prompt text to display and offer for copy.
 * @param notificationMessage - The message shown in the notification alongside
 *                              the "Copy Prompt" action button.
 * @returns                   - Whether the tab was opened and whether the user
 *                              copied the prompt.
 */
export async function presentPrompt(
  promptContent: string,
  notificationMessage: string
): Promise<PromptPresentResult> {
  let promptOpened = false;
  let copiedToClipboard = false;

  try {
    // Open an unsaved markdown document. No disk write occurs.
    // VS Code renders this as a markdown preview candidate (language tag only;
    // the file has no path and will not be persisted unless the user saves it).
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: promptContent,
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    promptOpened = true;

    // Show a notification with a single "Copy Prompt" action.
    // Awaiting here is intentional — it lets us respond to the user's click
    // while the tab is already visible in the editor.
    const copyAction = 'Copy Prompt';
    const choice = await vscode.window.showInformationMessage(
      notificationMessage,
      copyAction
    );

    if (choice === copyAction) {
      await vscode.env.clipboard.writeText(promptContent);
      vscode.window.showInformationMessage('Witness: Prompt copied to clipboard.');
      copiedToClipboard = true;
    }
  } catch {
    // Presentation failures are non-fatal. The caller records whatever state
    // was accumulated before the failure in its own telemetry event.
  }

  return { promptOpened, copiedToClipboard };
}
