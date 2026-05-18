import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, writeFileIfMissing } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import { getCurrentSessionId } from '../core/sessionRegistry';
import { parsePressurePercent, pressureLevelFor } from '../core/pressureLevel';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalTimestamp } from '../core/time';

// ---------------------------------------------------------------------------
// Substitution helpers
// ---------------------------------------------------------------------------

/**
 * Replaces ALL occurrences of `placeholder` in `content` with `value`.
 * Uses plain string splitting (no regex) to avoid issues with special characters.
 */
function replaceAll(content: string, placeholder: string, value: string): string {
  return content.split(placeholder).join(value);
}

/**
 * Replaces only the FIRST occurrence of `placeholder` in `content` with
 * `value`. Returns `content` unchanged if `placeholder` is not found.
 */
function replaceFirst(content: string, placeholder: string, value: string): string {
  const index = content.indexOf(placeholder);
  if (index === -1) {
    return content;
  }
  return content.slice(0, index) + value + content.slice(index + placeholder.length);
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Record Context Snapshot` command.
 *
 * Prompts for measurement method and pressure percentage, computes the pressure
 * level, writes a new snapshot file to `.witness/telemetry/<session-id>/`,
 * and opens the file in the editor for the user to complete remaining fields.
 */
export async function recordContext(context: vscode.ExtensionContext): Promise<void> {
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

    // 2. Require an active session.
    const sessionId = await getCurrentSessionId(witnessRoot);
    if (sessionId === undefined) {
      vscode.window.showErrorMessage(
        'Witness: No active session. Run "Witness: Start Session" first.'
      );
      return;
    }

    // 3. Prompt for measurement method.
    const method = await vscode.window.showQuickPick(
      ['direct', 'CLI-context-output', 'proxy-estimate'],
      {
        title: 'Context Pressure: Measurement Source',
        placeHolder: 'How was this measurement obtained?',
        ignoreFocusOut: true,
      }
    );

    if (method === undefined) {
      vscode.window.showInformationMessage('Witness: Record Context Snapshot cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.context_snapshot.created',
        commandId: 'witness.recordContext',
        sessionId,
        status: 'cancelled',
        durationMs: elapsed(),
      });
      return;
    }

    // 4. Prompt for pressure percentage with live validation.
    const raw = await vscode.window.showInputBox({
      title: 'Context Pressure: Estimated %',
      prompt: 'Estimated context window usage (0-100)',
      placeHolder: '45',
      ignoreFocusOut: true,
      validateInput: (value) => {
        try {
          parsePressurePercent(value);
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      },
    });

    if (raw === undefined) {
      vscode.window.showInformationMessage('Witness: Record Context Snapshot cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.context_snapshot.created',
        commandId: 'witness.recordContext',
        sessionId,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { measurement_method: method },
      });
      return;
    }

    // 5. Compute pressure values.
    const percent = parsePressurePercent(raw);
    const level = pressureLevelFor(percent);

    // 6. Compute snapshot ordinal by scanning the telemetry directory.
    const telemetryDir = vscode.Uri.joinPath(witnessRoot, 'telemetry', sessionId);
    await ensureDir(telemetryDir);

    let maxOrdinal = 0;
    try {
      const entries = await vscode.workspace.fs.readDirectory(telemetryDir);
      const snapshotPattern = /^context-pressure-(\d{3})\.md$/;
      for (const [name] of entries) {
        const match = snapshotPattern.exec(name);
        if (match) {
          const ordinal = parseInt(match[1], 10);
          if (ordinal > maxOrdinal) {
            maxOrdinal = ordinal;
          }
        }
      }
    } catch {
      // Directory unreadable — treat as empty.
    }

    const nextOrdinal = maxOrdinal + 1;
    const nnn = String(nextOrdinal).padStart(3, '0');
    const snapshotFilename = `context-pressure-${nnn}.md`;

    // 7. Load the context pressure template.
    let content = await loadTemplate(context, 'context-pressure-template.md');

    // 8. Substitute placeholders using the exact strings found in the template.
    //    Verified template placeholders:
    //      {{SESSION_ID}}                                 — appears once
    //      {{YYYY-MM-DDTHH:MM:SSZ}}                       — appears once (Snapshot Taken At)
    //      {{direct / CLI-context-output / proxy-estimate}} — appears once (Method field)
    //      {{NN}}%                                        — appears once (Estimated context usage)
    //      {{LOW / MEDIUM / HIGH / VERY HIGH / CRITICAL}} — appears once (Level field)
    //    Intentionally left as-is (user fills in):
    //      {{describe the specific tool, command, or estimation approach}}
    //      {{NOTES}}
    const snapshotAt = formatLocalTimestamp();
    content = replaceAll(content, '{{SESSION_ID}}', sessionId);
    content = replaceFirst(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', snapshotAt);
    content = replaceAll(
      content,
      '{{direct / CLI-context-output / proxy-estimate}}',
      method
    );
    content = replaceAll(content, '{{NN}}%', `${percent}%`);
    content = replaceAll(
      content,
      '{{LOW / MEDIUM / HIGH / VERY HIGH / CRITICAL}}',
      level
    );

    // 9. Write the snapshot file.
    const snapshotUri = vscode.Uri.joinPath(telemetryDir, snapshotFilename);
    const written = await writeFileIfMissing(snapshotUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Record Context Snapshot failed — Snapshot file already exists: ${snapshotUri.fsPath}`
      );
      return;
    }

    // 10. Open the snapshot file in the editor.
    const doc = await vscode.workspace.openTextDocument(snapshotUri);
    await vscode.window.showTextDocument(doc);

    // 11. Confirm success.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.context_snapshot.created',
      commandId: 'witness.recordContext',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, snapshotUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        pressure_percent: percent,
        pressure_level: level,
        measurement_method: method,
        snapshot_ordinal: nextOrdinal,
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Snapshot ${nnn} recorded — ${level} (${percent}%).`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.context_snapshot.created',
      commandId: 'witness.recordContext',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Record Context Snapshot failed — ${message}`
    );
  }
}
