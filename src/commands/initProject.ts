import * as vscode from 'vscode';
import {
  getWorkspaceRoot,
  getWitnessRoot,
  getWitnessSubdir,
  WITNESS_SUBDIRS,
} from '../core/witnessPaths';
import {
  ensureDir,
  writeFileIfMissing,
  writeGitkeep,
} from '../core/artifactWriter';
import {
  loadTemplate,
  loadHarnessTemplate,
  TEMPLATE_FILES,
  ROOT_DOC_FILES,
  AGENTS_ROOT_FILE,
  HARNESS_TEMPLATE_FILES,
} from '../core/templates';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';

// ---------------------------------------------------------------------------
// Shared init result type
// ---------------------------------------------------------------------------

/**
 * Metadata returned by `performProjectInit` for use in telemetry attributes.
 */
export interface ProjectInitResult {
  subdirsCreated: number;
  rootDocsWritten: number;
  templatesWritten: number;
  harnessFilesWritten: number;
}

// ---------------------------------------------------------------------------
// Shared core init function
// ---------------------------------------------------------------------------

/**
 * Core project initialization logic shared between `witness.initProject` and
 * `witness.enableProject`.
 *
 * Callers are responsible for:
 *   1. Verifying that a workspace root exists.
 *   2. Verifying that `.witness/` does NOT already exist before calling.
 *   3. Emitting their own telemetry event after this function returns.
 *   4. Showing their own user-facing success/error messages.
 *
 * Performs steps 4–10 of the original initProject implementation:
 * creates the `.witness/` directory tree, writes all template and harness
 * files, and returns a metadata object for use in telemetry attributes.
 *
 * @param context     - The extension context supplied by VS Code on activation.
 * @param witnessRoot - URI of the `.witness/` directory to create.
 * @returns           - Metadata counts for telemetry.
 */
export async function performProjectInit(
  context: vscode.ExtensionContext,
  witnessRoot: vscode.Uri
): Promise<ProjectInitResult> {
  // Create .witness/ itself.
  await ensureDir(witnessRoot);

  // Create all subdirectories.
  for (const subdir of WITNESS_SUBDIRS) {
    const subdirUri = getWitnessSubdir(witnessRoot, subdir);
    await ensureDir(subdirUri);
  }

  // Write .gitkeep into each empty record directory (everything except
  // 'templates' and 'harness', which receive actual files below).
  const emptySubdirs = WITNESS_SUBDIRS.filter(
    (s) => s !== 'templates' && s !== 'harness'
  );
  for (const subdir of emptySubdirs) {
    const subdirUri = getWitnessSubdir(witnessRoot, subdir);
    await writeGitkeep(subdirUri);
  }

  // Populate the four top-level documents from bundled templates.
  for (const filename of ROOT_DOC_FILES) {
    const content = await loadTemplate(context, filename);
    const destUri = vscode.Uri.joinPath(witnessRoot, filename);
    await writeFileIfMissing(destUri, content);
  }

  // Copy the twelve template files into .witness/templates/.
  const templatesDir = getWitnessSubdir(witnessRoot, 'templates');
  for (const filename of TEMPLATE_FILES) {
    const content = await loadTemplate(context, filename);
    const destUri = vscode.Uri.joinPath(templatesDir, filename);
    await writeFileIfMissing(destUri, content);
  }

  // Write the top-level AGENTS.md entry point into .witness/ (v4.6).
  const agentsContent = await loadTemplate(context, AGENTS_ROOT_FILE);
  const agentsDestUri = vscode.Uri.joinPath(witnessRoot, AGENTS_ROOT_FILE);
  await writeFileIfMissing(agentsDestUri, agentsContent);

  // Copy the harness protocol files into .witness/harness/ (v4.6/v4.7).
  const harnessDir = getWitnessSubdir(witnessRoot, 'harness');
  for (const filename of HARNESS_TEMPLATE_FILES) {
    const content = await loadHarnessTemplate(context, filename);
    const destUri = vscode.Uri.joinPath(harnessDir, filename);
    await writeFileIfMissing(destUri, content);
  }

  return {
    subdirsCreated: WITNESS_SUBDIRS.length,
    rootDocsWritten: ROOT_DOC_FILES.length,
    templatesWritten: TEMPLATE_FILES.length,
    harnessFilesWritten: HARNESS_TEMPLATE_FILES.length,
  };
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Initialize Project` command.
 *
 * Creates the `.witness/` directory tree in the current workspace root,
 * populates the four top-level documents from bundled templates, copies the
 * twelve template files into `.witness/templates/`, writes the Agent Harness
 * Pack entry point to `.witness/AGENTS.md`, copies the harness protocol
 * files into `.witness/harness/`, and writes `.gitkeep` files into the empty
 * record directories.
 *
 * If `.witness/` already exists the command exits early without overwriting
 * anything. If no workspace folder is open, an error message is shown.
 *
 * Delegates all directory and file creation to `performProjectInit`.
 */
export async function initProject(context: vscode.ExtensionContext): Promise<void> {
  const elapsed = createCommandTimer();
  try {
    // 1. Require an open workspace folder.
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      return;
    }

    // 2. Compute the .witness/ root URI.
    const witnessRoot = getWitnessRoot(workspaceRoot);

    // 3. If .witness/ already exists, bail out without overwriting.
    try {
      await vscode.workspace.fs.stat(witnessRoot);
      vscode.window.showInformationMessage(
        'Witness already initialized in this workspace.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.project.initialized',
        commandId: 'witness.initProject',
        sessionId: null,
        status: 'success',
        durationMs: elapsed(),
        attributes: {
          was_already_initialized: true,
          subdirs_created: 0,
          root_docs_written: 0,
          templates_written: 0,
        },
      });
      return;
    } catch {
      // Not found — proceed with initialization.
    }

    // 4. Run the shared project init core.
    const initResult = await performProjectInit(context, witnessRoot);

    // 5. Confirm success.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.project.initialized',
      commandId: 'witness.initProject',
      sessionId: null,
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        was_already_initialized: false,
        subdirs_created: initResult.subdirsCreated,
        root_docs_written: initResult.rootDocsWritten,
        templates_written: initResult.templatesWritten,
        harness_files_written: initResult.harnessFilesWritten,
        agents_root_written: true,
      },
    });
    vscode.window.showInformationMessage(
      'Witness: Initialized .witness/ in your workspace.'
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.project.initialized',
      commandId: 'witness.initProject',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(`Witness: Initialization failed — ${message}`);
  }
}
