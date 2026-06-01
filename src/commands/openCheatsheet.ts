import * as vscode from 'vscode';
import { writeFileIfMissing } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';

/**
 * Opens the workspace-local Witness cheatsheet.
 *
 * The command is intentionally not an initializer. If `.witness/` is missing,
 * it tells the user to start Witness first. If `.witness/` exists but the
 * cheatsheet is missing, it restores the bundled template with write-if-missing
 * behavior and opens it.
 */
export async function openCheatsheet(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showInformationMessage(
        'Witness: Open a workspace folder to view the cheatsheet.'
      );
      return;
    }

    const witnessRoot = getWitnessRoot(workspaceRoot);
    if (!(await pathExists(witnessRoot))) {
      vscode.window.showInformationMessage(
        'Witness is not enabled yet. Run "Witness: Start" first.'
      );
      return;
    }

    const cheatsheetUri = vscode.Uri.joinPath(witnessRoot, 'CHEATSHEET.md');
    if (!(await pathExists(cheatsheetUri))) {
      const content = await loadTemplate(context, 'CHEATSHEET.md');
      await writeFileIfMissing(cheatsheetUri, content);
    }

    const doc = await vscode.workspace.openTextDocument(cheatsheetUri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Witness: Cheatsheet failed — ${message}`);
  }
}

async function pathExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
