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

/**
 * Implementation of the `Witness: Initialize Project` command.
 *
 * Creates the `.witness/` directory tree in the current workspace root,
 * populates the four top-level documents from bundled templates, copies the
 * twelve template files into `.witness/templates/`, writes the Agent Harness
 * Pack entry point to `.witness/AGENTS.md`, copies the four harness protocol
 * files into `.witness/harness/`, and writes `.gitkeep` files into the empty
 * record directories.
 *
 * If `.witness/` already exists the command exits early without overwriting
 * anything. If no workspace folder is open, an error message is shown.
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

    // 4. Create .witness/ itself.
    await ensureDir(witnessRoot);

    // 5. Create all subdirectories.
    for (const subdir of WITNESS_SUBDIRS) {
      const subdirUri = getWitnessSubdir(witnessRoot, subdir);
      await ensureDir(subdirUri);
    }

    // 6. Write .gitkeep into each empty record directory (everything except
    //    'templates' and 'harness', which will receive actual files below).
    const emptySubdirs = WITNESS_SUBDIRS.filter(
      (s) => s !== 'templates' && s !== 'harness'
    );
    for (const subdir of emptySubdirs) {
      const subdirUri = getWitnessSubdir(witnessRoot, subdir);
      await writeGitkeep(subdirUri);
    }

    // 7. Populate the four top-level documents from bundled templates.
    for (const filename of ROOT_DOC_FILES) {
      const content = await loadTemplate(context, filename);
      const destUri = vscode.Uri.joinPath(witnessRoot, filename);
      await writeFileIfMissing(destUri, content);
    }

    // 8. Copy the twelve template files into .witness/templates/.
    const templatesDir = getWitnessSubdir(witnessRoot, 'templates');
    for (const filename of TEMPLATE_FILES) {
      const content = await loadTemplate(context, filename);
      const destUri = vscode.Uri.joinPath(templatesDir, filename);
      await writeFileIfMissing(destUri, content);
    }

    // 9. Write the top-level AGENTS.md entry point into .witness/ (v4.6).
    const agentsContent = await loadTemplate(context, AGENTS_ROOT_FILE);
    const agentsDestUri = vscode.Uri.joinPath(witnessRoot, AGENTS_ROOT_FILE);
    await writeFileIfMissing(agentsDestUri, agentsContent);

    // 10. Copy the four harness protocol files into .witness/harness/ (v4.6).
    const harnessDir = getWitnessSubdir(witnessRoot, 'harness');
    for (const filename of HARNESS_TEMPLATE_FILES) {
      const content = await loadHarnessTemplate(context, filename);
      const destUri = vscode.Uri.joinPath(harnessDir, filename);
      await writeFileIfMissing(destUri, content);
    }

    // 11. Confirm success.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.project.initialized',
      commandId: 'witness.initProject',
      sessionId: null,
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        was_already_initialized: false,
        subdirs_created: WITNESS_SUBDIRS.length,
        root_docs_written: ROOT_DOC_FILES.length,
        templates_written: TEMPLATE_FILES.length,
        harness_files_written: HARNESS_TEMPLATE_FILES.length,
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
