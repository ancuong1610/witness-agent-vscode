import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Minimal type shims for the vscode.git extension API.
// We use `any` for the raw API object to avoid depending on @types/vscode-git,
// which is not bundled. The strongly-typed surface is `GitObservation`.
// ---------------------------------------------------------------------------

/** A single repository change entry returned by the git extension. */
interface RawChange {
  uri: vscode.Uri;
}

/** Minimal shape of a repository exposed by the vscode.git API (version 1). */
interface RawRepo {
  rootUri: vscode.Uri;
  state: {
    HEAD?: {
      name?: string;
      commit?: string;
    };
    workingTreeChanges: RawChange[];
    indexChanges: RawChange[];
    untrackedChanges?: RawChange[];
  };
  log(options: { maxEntries: number }): Promise<{ hash: string; message: string }[]>;
}

/** Minimal shape of the vscode.git API (version 1). */
interface GitAPI {
  repositories: RawRepo[];
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Structured observation of the current git state, produced by `observeGit`.
 */
export interface GitObservation {
  /** True if the vscode.git extension is loaded and active. */
  available: boolean;
  /** Why the extension is unavailable or has no primary repository, if applicable. */
  reason?: string;
  /** Total number of repositories found in the workspace. */
  repositoryCount: number;
  /** State of the primary repository (first repo whose root is inside the workspace). */
  primary?: {
    branch: string | undefined;
    headCommit: { sha: string; message: string } | undefined;
    workingChanges: number;
    indexChanges: number;
    untrackedChanges: number;
    /** Up to 10 workspace-relative dirty file paths. */
    dirtyFilePaths: string[];
    /** Last 5 commits on the current branch (sha + first line of message). */
    recentCommits: { sha: string; message: string }[];
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Observes the git state for the given workspace root using the built-in
 * `vscode.git` extension API. Never throws — returns a partial observation
 * if any API call fails.
 *
 * @param workspaceRoot - URI of the open workspace folder.
 */
export async function observeGit(workspaceRoot: vscode.Uri): Promise<GitObservation> {
  // 1. Check that the vscode.git extension is present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gitExt = vscode.extensions.getExtension<{ getAPI: (version: number) => GitAPI }>('vscode.git');

  if (gitExt === undefined) {
    return {
      available: false,
      reason: 'vscode.git extension not installed',
      repositoryCount: 0,
    };
  }

  // 2. Activate the extension and obtain the API.
  let api: GitAPI;
  try {
    const exports = await gitExt.activate();
    api = exports.getAPI(1);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      available: false,
      reason: `vscode.git activation failed: ${msg}`,
      repositoryCount: 0,
    };
  }

  const repos = api.repositories;

  if (!repos || repos.length === 0) {
    return {
      available: true,
      reason: 'no git repositories found in workspace',
      repositoryCount: 0,
    };
  }

  // 3. Select the primary repository: prefer one whose rootUri is a prefix of
  //    workspaceRoot, otherwise fall back to the first repository.
  const wsPath = workspaceRoot.fsPath;
  let primary: RawRepo | undefined = repos.find((r) =>
    wsPath.startsWith(r.rootUri.fsPath)
  );
  if (!primary) {
    primary = repos[0];
  }

  // 4. Extract data from the primary repository.
  try {
    const state = primary.state;
    const branch = state.HEAD?.name;

    // Dirty file paths: concat working tree, index, and untracked changes.
    const allChanges: RawChange[] = [
      ...state.workingTreeChanges,
      ...state.indexChanges,
      ...(state.untrackedChanges ?? []),
    ];
    const rootPath = primary.rootUri.fsPath;
    const dirtyFilePaths = allChanges
      .slice(0, 10)
      .map((c) => {
        const fp = c.uri.fsPath;
        // Make workspace-relative by stripping the repo root prefix.
        return fp.startsWith(rootPath) ? fp.slice(rootPath.length).replace(/^[\\/]/, '') : fp;
      });

    // Recent commits.
    let recentCommits: { sha: string; message: string }[] = [];
    try {
      const log = await primary.log({ maxEntries: 5 });
      recentCommits = log.map((entry) => ({
        sha: entry.hash,
        message: entry.message.split('\n')[0],
      }));
    } catch {
      // log() unavailable — leave empty.
    }

    // Head commit: use first entry of recentCommits if available.
    let headCommit: { sha: string; message: string } | undefined;
    if (recentCommits.length > 0) {
      headCommit = recentCommits[0];
    }

    return {
      available: true,
      repositoryCount: repos.length,
      primary: {
        branch,
        headCommit,
        workingChanges: state.workingTreeChanges.length,
        indexChanges: state.indexChanges.length,
        untrackedChanges: state.untrackedChanges?.length ?? 0,
        dirtyFilePaths,
        recentCommits,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      available: true,
      reason: `error reading primary repository state: ${msg}`,
      repositoryCount: repos.length,
    };
  }
}
