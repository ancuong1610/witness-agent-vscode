import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of scanning the `docs/superpowers/` directory in the workspace.
 */
export interface SuperpowersObservation {
  /** True if `<workspaceRoot>/docs/superpowers/` exists. */
  superpowersDirExists: boolean;
  /**
   * Presence status of the three canonical Superpowers artifact files.
   * Always contains exactly three entries (spec.md, plan.md, tasks.md).
   */
  artifacts: {
    /** Filename, e.g. `'spec.md'`. */
    name: string;
    /** Path relative to workspace root, e.g. `'docs/superpowers/spec.md'`. */
    relativePath: string;
    /** Whether the file exists in the directory. */
    present: boolean;
  }[];
  /** Any files in `docs/superpowers/` beyond the three canonical ones. Workspace-relative. */
  otherFiles: string[];
}

/** The three canonical Superpowers artifact filenames. */
const CANONICAL_ARTIFACTS = ['spec.md', 'plan.md', 'tasks.md'] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Scans `<workspaceRoot>/docs/superpowers/` for Superpowers artifacts.
 *
 * If the directory does not exist, returns `superpowersDirExists: false` with
 * all canonical artifacts marked absent. Never throws.
 *
 * @param workspaceRoot - URI of the open workspace folder.
 */
export async function scanSuperpowers(
  workspaceRoot: vscode.Uri
): Promise<SuperpowersObservation> {
  const superpowersDir = vscode.Uri.joinPath(workspaceRoot, 'docs', 'superpowers');

  // Check whether the directory exists.
  try {
    const stat = await vscode.workspace.fs.stat(superpowersDir);
    if (stat.type !== vscode.FileType.Directory) {
      // Path exists but is not a directory — treat as absent.
      return absentResult();
    }
  } catch {
    // Directory does not exist.
    return absentResult();
  }

  // Read the directory contents.
  let entries: [string, vscode.FileType][] = [];
  try {
    entries = await vscode.workspace.fs.readDirectory(superpowersDir);
  } catch {
    // Cannot read directory — treat as empty.
  }

  const foundNames = new Set(entries.map(([name]) => name));

  // Build canonical artifacts list.
  const artifacts = CANONICAL_ARTIFACTS.map((name) => ({
    name,
    relativePath: `docs/superpowers/${name}`,
    present: foundNames.has(name),
  }));

  // Collect any files not in the canonical set.
  const canonicalSet = new Set<string>(CANONICAL_ARTIFACTS);
  const otherFiles = entries
    .filter(([name]) => !canonicalSet.has(name))
    .map(([name]) => `docs/superpowers/${name}`);

  return {
    superpowersDirExists: true,
    artifacts,
    otherFiles,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns a SuperpowersObservation with superpowersDirExists = false. */
function absentResult(): SuperpowersObservation {
  return {
    superpowersDirExists: false,
    artifacts: CANONICAL_ARTIFACTS.map((name) => ({
      name,
      relativePath: `docs/superpowers/${name}`,
      present: false,
    })),
    otherFiles: [],
  };
}
