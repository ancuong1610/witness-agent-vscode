import * as vscode from 'vscode';

/**
 * Subdirectories created under `.witness/` during initialization.
 * `templates` holds the bundled template copies.
 * `harness` holds the agent harness protocol files (v4.6 Agent Harness Pack).
 * `checkpoints` holds checkpoint files created during active sessions (v6.3).
 * The rest hold runtime records.
 */
export const WITNESS_SUBDIRS = [
  'templates',
  'harness',
  'sessions',
  'telemetry',
  'subagents',
  'decisions',
  'handovers',
  'evaluation',
  'checkpoints',
] as const;

/**
 * Returns the root URI of the first workspace folder, or undefined if no
 * workspace is open.
 */
export function getWorkspaceRoot(): vscode.Uri | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri;
}

/**
 * Returns the URI of the `.witness/` directory inside the given workspace root.
 */
export function getWitnessRoot(workspaceRoot: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(workspaceRoot, '.witness');
}

/**
 * Returns the URI of a named subdirectory inside the `.witness/` directory.
 *
 * @param witnessRoot - URI returned by `getWitnessRoot`
 * @param name - subdirectory name (e.g. `'sessions'`, `'handovers'`)
 */
export function getWitnessSubdir(witnessRoot: vscode.Uri, name: string): vscode.Uri {
  return vscode.Uri.joinPath(witnessRoot, name);
}
