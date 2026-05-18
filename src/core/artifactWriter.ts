import * as vscode from 'vscode';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Creates a directory at `uri` if it does not already exist.
 * If the directory already exists, this is a no-op.
 */
export async function ensureDir(uri: vscode.Uri): Promise<void> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type !== vscode.FileType.Directory) {
      throw new Error(`Path exists but is not a directory: ${uri.fsPath}`);
    }
    // Directory already exists — nothing to do.
  } catch (err: unknown) {
    // vscode.FileSystemError.FileNotFound is thrown when the path doesn't exist.
    // Any other error is re-thrown.
    if (isFileNotFound(err)) {
      await vscode.workspace.fs.createDirectory(uri);
    } else {
      throw err;
    }
  }
}

/**
 * Writes `content` to `uri` only if the file does not already exist.
 *
 * @returns `true` if the file was written, `false` if it already existed.
 */
export async function writeFileIfMissing(
  uri: vscode.Uri,
  content: string
): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    // File exists — do not overwrite.
    return false;
  } catch (err: unknown) {
    if (isFileNotFound(err)) {
      await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
      return true;
    }
    throw err;
  }
}

/**
 * Writes an empty `.gitkeep` file into `dirUri`.
 * Used to ensure that otherwise-empty directories are tracked by git.
 */
export async function writeGitkeep(dirUri: vscode.Uri): Promise<void> {
  const gitkeepUri = vscode.Uri.joinPath(dirUri, '.gitkeep');
  await vscode.workspace.fs.writeFile(gitkeepUri, encoder.encode(''));
}

/**
 * Reads a file at `uri` and returns its contents as a string.
 * Throws if the file does not exist.
 */
export async function readFile(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return decoder.decode(bytes);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `err` represents a "file not found" condition from the VS
 * Code filesystem API. The API throws a `vscode.FileSystemError` with code
 * `FileNotFound`, but we also handle plain `Error` objects with that message
 * for test-environment compatibility.
 */
function isFileNotFound(err: unknown): boolean {
  if (err instanceof vscode.FileSystemError) {
    return err.code === 'FileNotFound';
  }
  if (err instanceof Error) {
    // Fallback heuristic for virtual-fs implementations that surface ENOENT.
    return err.message.includes('ENOENT') || err.message.includes('FileNotFound');
  }
  return false;
}
