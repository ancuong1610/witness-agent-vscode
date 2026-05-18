import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, readFile, writeFileIfMissing } from '../core/artifactWriter';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalTimestamp } from '../core/time';

// ---------------------------------------------------------------------------
// Local helpers (intentionally not shared — inlined per Task 007 spec)
// ---------------------------------------------------------------------------

/**
 * Escapes a string for safe use inside a `RegExp` constructor.
 * Same pattern as observeWorkspace.ts, assessRisk.ts, and createResumeProbe.ts.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads a directory, returning an empty array if it does not exist or cannot
 * be read.
 */
async function safeReadDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Compress Current State` command.
 *
 * Snapshots the current contents of `.witness/current-state.md` into a dated
 * archive file at `.witness/sessions/<session-id>-current-state-NNN.md`, then
 * opens the live `current-state.md` in the editor for manual trimming.
 * Displays an info message with pre-compression statistics and an "Open
 * Snapshot" action button that opens the archive in a side-by-side editor.
 *
 * Requires an active session. Does NOT perform any automated compression —
 * the user trims the live file manually while referencing the snapshot.
 */
export async function compressState(context: vscode.ExtensionContext): Promise<void> {
  void context; // context reserved for future use
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

    // 4. Check that current-state.md exists at .witness/current-state.md.
    const currentStateUri = vscode.Uri.joinPath(witnessRoot, 'current-state.md');
    try {
      await vscode.workspace.fs.stat(currentStateUri);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: current-state.md missing — re-run "Witness: Initialize Project".'
      );
      return;
    }

    // 5. Read the current content of current-state.md.
    const originalContent = await readFile(currentStateUri);

    // 6. Compute the next archive ordinal.
    //    Scan .witness/sessions/ for files matching
    //    ^<escaped-sessionId>-current-state-(\d{3})\.md$
    const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
    await ensureDir(sessionsDir);

    const sessionEntries = await safeReadDirectory(sessionsDir);
    const escaped = escapeRegExp(sessionId);
    const archivePattern = new RegExp(`^${escaped}-current-state-(\\d{3})\\.md$`);

    // Find the highest existing ordinal; default to 0 if none found.
    let maxOrdinal = 0;
    for (const [name] of sessionEntries) {
      const match = archivePattern.exec(name);
      if (match) {
        const ordinal = parseInt(match[1], 10);
        if (ordinal > maxOrdinal) {
          maxOrdinal = ordinal;
        }
      }
    }
    const nextOrdinal = maxOrdinal + 1;
    const nnn = String(nextOrdinal).padStart(3, '0');
    const archiveFilename = `${sessionId}-current-state-${nnn}.md`;

    // 7. Compute pre-compression statistics.
    const lines = originalContent.split('\n');
    const lineCount = lines.length;
    const charCount = originalContent.length;
    const headingCount = lines.filter(l => l.startsWith('#')).length;

    // 8. Compose the archive file content.
    const capturedAt = formatLocalTimestamp();

    let archiveContent: string;

    if (lineCount === 1 && originalContent.length === 0) {
      // Edge case: file is completely empty (split on '\n' of '' gives [''])
      archiveContent = [
        `# Current State Snapshot: ${sessionId}-current-state-${nnn}`,
        '',
        `**Captured during session**: ${sessionId}`,
        `**Captured at**: ${capturedAt}`,
        '**Reason**: Pre-compression snapshot (triggered by Witness: Compress Current State)',
        '',
        `This file preserves the contents of \`.witness/current-state.md\` as they were at the moment the`,
        `Compress Current State command ran. Use it as a reference when deciding what to trim from the live`,
        `\`current-state.md\`, and as an audit trail of how project state has evolved across sessions.`,
        '',
        '---',
        '',
        '',
      ].join('\n');
    } else {
      archiveContent = [
        `# Current State Snapshot: ${sessionId}-current-state-${nnn}`,
        '',
        `**Captured during session**: ${sessionId}`,
        `**Captured at**: ${capturedAt}`,
        '**Reason**: Pre-compression snapshot (triggered by Witness: Compress Current State)',
        '',
        `This file preserves the contents of \`.witness/current-state.md\` as they were at the moment the`,
        `Compress Current State command ran. Use it as a reference when deciding what to trim from the live`,
        `\`current-state.md\`, and as an audit trail of how project state has evolved across sessions.`,
        '',
        '---',
        '',
        originalContent,
      ].join('\n');
    }

    // 9. Write the archive file to .witness/sessions/<archive-filename>.
    const archiveUri = vscode.Uri.joinPath(sessionsDir, archiveFilename);
    const written = await writeFileIfMissing(archiveUri, archiveContent);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Compress Current State failed — Archive file already exists: ${archiveUri.fsPath}`
      );
      return;
    }

    // 10. Open current-state.md in the editor (not the archive).
    const liveDoc = await vscode.workspace.openTextDocument(currentStateUri);
    await vscode.window.showTextDocument(liveDoc, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
      selection: new vscode.Range(0, 0, 0, 0),
    });

    // 11. Show info message with stats and an "Open Snapshot" action button.
    let infoMessage: string;
    if (originalContent.length === 0) {
      infoMessage =
        `Witness: Snapshot saved (0 lines). current-state.md was empty — fill it in before next compression.`;
    } else {
      infoMessage =
        `Witness: Snapshot saved to ${archiveFilename} (${lineCount} lines, ${charCount} chars, ${headingCount} headings). Trim current-state.md now; compare with the snapshot to ensure no critical context is lost.`;
    }

    const action = await vscode.window.showInformationMessage(
      infoMessage,
      'Open Snapshot'
    );

    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.current_state.snapshot_created',
      commandId: 'witness.compressState',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, archiveUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        was_empty: originalContent.length === 0,
        line_count: lineCount,
        char_count: charCount,
        heading_count: headingCount,
        archive_ordinal: nextOrdinal,
      },
    });
    if (action === 'Open Snapshot') {
      const archiveDoc = await vscode.workspace.openTextDocument(archiveUri);
      await vscode.window.showTextDocument(archiveDoc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.current_state.snapshot_created',
      commandId: 'witness.compressState',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(`Witness: Compress Current State failed — ${message}`);
  }
}
