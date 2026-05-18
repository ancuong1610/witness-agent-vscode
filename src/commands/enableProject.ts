// ---------------------------------------------------------------------------
// enableProject.ts — Witness: Enable for This Project command (v5.3).
// ---------------------------------------------------------------------------
//
// Beginner-friendly wrapper around project initialization. Uses plain-language
// messages and, on first-time enable, opens a short onboarding page so the
// user knows exactly what to do next.
//
// Behavior:
//   1. No workspace open → error, exit.
//   2. .witness/ already exists → show "already enabled" message + offer
//      optional "Show Onboarding" action. Does not re-initialize anything.
//   3. .witness/ does not exist → run init, open onboarding tab, show
//      next-step message.
//
// Design invariants:
//   - Onboarding page is only opened automatically on first-time enable.
//   - Onboarding content comes from generateFirstRunOnboarding() — pure text,
//     no filesystem reads.
//   - Does not overwrite existing .witness/ files.
//   - Does not start a session automatically.
//   - Does not inject context into any coding agent.
//   - No LLM calls. No webview. No new dependencies.
//   - Onboarding kept in enableProject only — not in performProjectInit — so
//     the advanced witness.initProject command is not affected.
//
// Telemetry event: witness.project.enabled
//   attributes: was_already_initialized, onboarding_opened (boolean each)
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { performProjectInit } from './initProject';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';
import { generateFirstRunOnboarding } from '../core/onboardingContent';

// ---------------------------------------------------------------------------
// Onboarding tab helper
// ---------------------------------------------------------------------------

/**
 * Opens the first-run onboarding content as an unsaved markdown editor tab.
 * Non-fatal: any failure is silently swallowed so the overall command does
 * not fail just because the tab could not be opened.
 *
 * @returns True if the tab was opened successfully, false otherwise.
 */
async function openOnboardingTab(): Promise<boolean> {
  try {
    const content = generateFirstRunOnboarding();
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content,
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Enable for This Project` command (v5.3).
 *
 * Beginner-friendly wrapper around project initialization. Uses plain-language
 * messages and a first-run onboarding page. Delegates all directory and file
 * creation to `performProjectInit`, the same core used by `witness.initProject`.
 *
 * Emits telemetry event `witness.project.enabled` with attributes:
 *   `was_already_initialized`, `onboarding_opened`.
 */
export async function enableProject(context: vscode.ExtensionContext): Promise<void> {
  const elapsed = createCommandTimer();

  // Telemetry state.
  let onboardingOpened = false;

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
    // 2. Compute the .witness/ root URI.
    // -------------------------------------------------------------------------
    const witnessRoot = getWitnessRoot(workspaceRoot);

    // -------------------------------------------------------------------------
    // 3. If .witness/ already exists, show friendly message and optionally
    //    offer to open the onboarding page on request.
    // -------------------------------------------------------------------------
    try {
      await vscode.workspace.fs.stat(witnessRoot);

      // Already initialized — offer Show Onboarding as an optional action.
      const showOnboardingAction = 'Show Onboarding';
      const choice = await vscode.window.showInformationMessage(
        'Witness: Witness is already enabled in this project.',
        showOnboardingAction
      );

      if (choice === showOnboardingAction) {
        onboardingOpened = await openOnboardingTab();
      }

      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.project.enabled',
        commandId: 'witness.enableProject',
        sessionId: null,
        status: 'success',
        durationMs: elapsed(),
        attributes: {
          was_already_initialized: true,
          onboarding_opened: onboardingOpened,
        },
      });
      return;
    } catch {
      // Not found — proceed with initialization below.
    }

    // -------------------------------------------------------------------------
    // 4. Run the shared project init core.
    // -------------------------------------------------------------------------
    const initResult = await performProjectInit(context, witnessRoot);

    // -------------------------------------------------------------------------
    // 5. Open the onboarding page in an unsaved markdown tab.
    // -------------------------------------------------------------------------
    onboardingOpened = await openOnboardingTab();

    // -------------------------------------------------------------------------
    // 6. Show beginner-friendly next-step message.
    // -------------------------------------------------------------------------
    vscode.window.showInformationMessage(
      'Witness: Witness is enabled. Start by running "Witness: Start Tracking This Task".'
    );

    // -------------------------------------------------------------------------
    // 7. Emit success telemetry.
    // -------------------------------------------------------------------------
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.project.enabled',
      commandId: 'witness.enableProject',
      sessionId: null,
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        was_already_initialized: false,
        onboarding_opened: onboardingOpened,
        subdirs_created: initResult.subdirsCreated,
        root_docs_written: initResult.rootDocsWritten,
        templates_written: initResult.templatesWritten,
        harness_files_written: initResult.harnessFilesWritten,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.project.enabled',
      commandId: 'witness.enableProject',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        was_already_initialized: false,
        onboarding_opened: onboardingOpened,
      },
    });
    vscode.window.showErrorMessage(`Witness: Enable failed — ${message}`);
  }
}
