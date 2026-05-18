import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, writeFileIfMissing } from '../core/artifactWriter';
import { getCurrentSessionId } from '../core/sessionRegistry';
import { observeGit, GitObservation } from '../core/gitObserver';
import { scanSuperpowers, SuperpowersObservation } from '../core/superpowersScanner';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalTimestamp } from '../core/time';

// ---------------------------------------------------------------------------
// Markdown rendering helpers
// ---------------------------------------------------------------------------

/**
 * Renders the Git State section of the observation markdown.
 */
function renderGitSection(git: GitObservation): string {
  if (!git.available) {
    return `Git extension not available: ${git.reason ?? 'unknown reason'}`;
  }

  if (!git.primary) {
    return `No primary repository: ${git.reason ?? 'unknown reason'}`;
  }

  const p = git.primary;
  const branch = p.branch ?? '(detached)';

  let headLine: string;
  if (p.headCommit) {
    const sha = p.headCommit.sha.slice(0, 7);
    const msg = p.headCommit.message.split('\n')[0];
    headLine = `${sha} — ${msg}`;
  } else {
    headLine = '(no commits)';
  }

  const lines: string[] = [
    `**Branch**: ${branch}`,
    `**HEAD**: ${headLine}`,
    `**Working changes**: ${p.workingChanges}  **Index changes**: ${p.indexChanges}  **Untracked**: ${p.untrackedChanges}`,
  ];

  // Dirty file paths.
  if (p.dirtyFilePaths.length > 0) {
    lines.push('');
    lines.push('**Dirty file paths** (first 10):');
    for (const fp of p.dirtyFilePaths) {
      lines.push(`- ${fp}`);
    }
  } else {
    lines.push('');
    lines.push('No dirty files.');
  }

  // Recent commits.
  if (p.recentCommits.length > 0) {
    lines.push('');
    lines.push('**Recent commits**:');
    lines.push('');
    lines.push('| SHA | Message |');
    lines.push('|-----|---------|');
    for (const commit of p.recentCommits) {
      const sha = commit.sha.slice(0, 7);
      const msg = commit.message.split('\n')[0];
      lines.push(`| ${sha} | ${msg} |`);
    }
  }

  return lines.join('\n');
}

/**
 * Renders the Superpowers Artifacts section of the observation markdown.
 */
function renderSuperpowersSection(sp: SuperpowersObservation): string {
  if (!sp.superpowersDirExists) {
    return 'No `docs/superpowers/` directory.';
  }

  const lines: string[] = [];
  lines.push('| Artifact | Present |');
  lines.push('|----------|---------|');
  for (const artifact of sp.artifacts) {
    lines.push(`| ${artifact.relativePath} | ${artifact.present ? 'Yes' : 'No'} |`);
  }

  if (sp.otherFiles.length > 0) {
    lines.push('');
    lines.push('**Other artifacts**:');
    for (const f of sp.otherFiles) {
      lines.push(`- ${f}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Observe Workspace` command.
 *
 * Captures git state via the vscode.git extension API and scans for Superpowers
 * artifacts, then writes a sequential `<session-id>-observation-NNN.md` file
 * into `.witness/sessions/` and opens it in the editor. Requires an active session.
 */
export async function observeWorkspace(context: vscode.ExtensionContext): Promise<void> {
  void context; // context reserved for future use (template loading etc.)
  const elapsed = createCommandTimer();
  try {
    // 1. Require an open workspace folder.
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      return;
    }

    // 2. Require .witness/ to exist.
    const witnessRoot = getWitnessRoot(workspaceRoot);
    try {
      await vscode.workspace.fs.stat(witnessRoot);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: Run "Witness: Initialize Project" first.'
      );
      return;
    }

    // 3. Require an active session.
    const sessionId = await getCurrentSessionId(witnessRoot);
    if (sessionId === undefined) {
      vscode.window.showErrorMessage(
        'Witness: No active session. Run "Witness: Start Session" first.'
      );
      return;
    }

    // 4. Gather observations in parallel.
    const [git, superpowers] = await Promise.all([
      observeGit(workspaceRoot),
      scanSuperpowers(workspaceRoot),
    ]);

    // 5. Compute the next observation ordinal by scanning sessions/ for existing
    //    files matching <session-id>-observation-NNN.md.
    const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
    await ensureDir(sessionsDir);

    const observationPattern = new RegExp(
      `^${escapeRegExp(sessionId)}-observation-(\\d{3})\\.md$`
    );
    let maxOrdinal = 0;

    try {
      const entries = await vscode.workspace.fs.readDirectory(sessionsDir);
      for (const [name] of entries) {
        const match = observationPattern.exec(name);
        if (match) {
          const ordinal = parseInt(match[1], 10);
          if (ordinal > maxOrdinal) {
            maxOrdinal = ordinal;
          }
        }
      }
    } catch {
      // Unreadable directory — treat as empty.
    }

    const nextOrdinal = maxOrdinal + 1;
    const nnn = String(nextOrdinal).padStart(3, '0');
    const observationId = `${sessionId}-observation-${nnn}`;
    const observationFilename = `${observationId}.md`;

    // 6. Compose the observation markdown.
    const observedAt = formatLocalTimestamp();
    const gitSection = renderGitSection(git);
    const superpowersSection = renderSuperpowersSection(superpowers);

    const content = [
      `# Workspace Observation: ${observationId}`,
      '',
      `**Session**: ${sessionId}`,
      `**Observed At**: ${observedAt}`,
      '',
      '---',
      '',
      '## Git State',
      '',
      gitSection,
      '',
      '---',
      '',
      '## Superpowers Artifacts',
      '',
      superpowersSection,
      '',
      '---',
      '',
      '## Workspace',
      '',
      `**Root**: ${workspaceRoot.fsPath}`,
    ].join('\n');

    // 7. Write the observation file.
    const observationUri = vscode.Uri.joinPath(sessionsDir, observationFilename);
    const written = await writeFileIfMissing(observationUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Observe Workspace failed — Observation file already exists: ${observationUri.fsPath}`
      );
      return;
    }

    // 8. Open the file in the editor.
    const doc = await vscode.workspace.openTextDocument(observationUri);
    await vscode.window.showTextDocument(doc);

    // 9. Confirm success.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workspace.observed',
      commandId: 'witness.observeWorkspace',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, observationUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        git_available: git.available,
        git_has_primary: git.primary !== undefined,
        dirty_files_count: git.primary
          ? git.primary.workingChanges + git.primary.indexChanges
          : 0,
        untracked_files_count: git.primary?.untrackedChanges ?? 0,
        superpowers_dir_exists: superpowers.superpowersDirExists,
        observation_ordinal: nextOrdinal,
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Observation ${nnn} recorded for session ${sessionId}.`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.workspace.observed',
      commandId: 'witness.observeWorkspace',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(`Witness: Observe Workspace failed — ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a string for safe use inside a `RegExp` constructor.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
