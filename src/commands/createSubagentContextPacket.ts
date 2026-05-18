import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { loadTemplate } from '../core/templates';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  SubagentLedgerEntry,
  listSubagentLedgerEntries,
  filterLedgerEntriesByPresentStage,
  filterLedgerEntriesByMissingStage,
  getSubagentLedgerStageUri,
} from '../core/subagentLedger';
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

// ---------------------------------------------------------------------------
// QuickPick item type
// ---------------------------------------------------------------------------

interface SubagentPickItem extends vscode.QuickPickItem {
  entry: SubagentLedgerEntry;
}

// ---------------------------------------------------------------------------
// Text encoder (module-level, reused across calls)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Create Subagent Context Packet` command.
 *
 * Lists all v2 ledger entries that have a contract but no context-packet, presents
 * them in a QuickPick, then prompts for context details and writes
 * `context-packet.md` into the selected `subagent-NNN/` directory.
 *
 * Unlike contract.md, the context packet is written with "create or overwrite"
 * semantics because context assembly is iterative and the user may want to
 * regenerate it from fresh prompts.
 */
export async function createSubagentContextPacket(
  context: vscode.ExtensionContext
): Promise<void> {
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

    // 3. Active session is optional.
    const sessionId = await getCurrentSessionId(witnessRoot);
    const hadActiveSession = sessionId !== undefined;

    // 4. List all v2 ledger entries, keep those with a contract but no context-packet.
    const allEntries = await listSubagentLedgerEntries(workspaceRoot);
    const withContract = filterLedgerEntriesByPresentStage(allEntries, 'contract');
    const eligible = filterLedgerEntriesByMissingStage(withContract, 'context-packet');

    if (eligible.length === 0) {
      vscode.window.showInformationMessage(
        'Witness: No subagent tasks are waiting for a context packet. ' +
        'Run "Witness: Start Subagent Task" first.'
      );
      return;
    }

    // 5. QuickPick — select which subagent task to create a context packet for.
    const items: SubagentPickItem[] = eligible.map(entry => ({
      label: entry.id,
      description: 'contract ✓  ·  context-packet missing',
      entry,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Witness: Create Subagent Context Packet',
      placeHolder: 'Select the subagent task',
      ignoreFocusOut: true,
    });

    if (selected === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Create Subagent Context Packet cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.context_packet_created',
        commandId: 'witness.createSubagentContextPacket',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession },
      });
      return;
    }

    const entry = selected.entry;
    const subagentId = entry.id;
    const taskOrdinal = entry.ordinal;

    // 6. Prompt: source files (empty allowed — means none).
    const rawSourceFiles = await vscode.window.showInputBox({
      title: `Witness: Context Packet for ${subagentId}`,
      prompt: 'Source files to include — workspace-relative paths, comma or newline separated',
      placeHolder: 'src/auth/tokenService.ts, src/auth/authModule.ts',
      ignoreFocusOut: true,
    });

    if (rawSourceFiles === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Create Subagent Context Packet cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.context_packet_created',
        commandId: 'witness.createSubagentContextPacket',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession, task_ordinal: taskOrdinal },
      });
      return;
    }

    // 7. Prompt: witness artifacts to include (empty allowed — means none).
    const rawArtifacts = await vscode.window.showInputBox({
      title: `Witness: Context Packet for ${subagentId}`,
      prompt: 'Witness artifacts to include — e.g. current-state.md, a handover file',
      placeHolder: '.witness/current-state.md',
      ignoreFocusOut: true,
    });

    if (rawArtifacts === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Create Subagent Context Packet cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.context_packet_created',
        commandId: 'witness.createSubagentContextPacket',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession, task_ordinal: taskOrdinal },
      });
      return;
    }

    // 8. Prompt: explicitly excluded context (empty allowed — means none).
    const rawExcluded = await vscode.window.showInputBox({
      title: `Witness: Context Packet for ${subagentId}`,
      prompt: 'Explicitly excluded context — what was considered but left out, and why',
      placeHolder: 'Previous handover files: not relevant to this task',
      ignoreFocusOut: true,
    });

    if (rawExcluded === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Create Subagent Context Packet cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.context_packet_created',
        commandId: 'witness.createSubagentContextPacket',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession, task_ordinal: taskOrdinal },
      });
      return;
    }

    // 9. Prompt: estimated token count (optional — empty string means not measured).
    const rawTokenCount = await vscode.window.showInputBox({
      title: `Witness: Context Packet for ${subagentId}`,
      prompt: 'Estimated token count of included context (optional — leave blank if not measured)',
      placeHolder: '4200',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (value.trim().length === 0) { return undefined; }
        const n = Number(value.trim());
        if (!Number.isInteger(n) || n < 0) {
          return 'Enter a non-negative integer, or leave blank.';
        }
        return undefined;
      },
    });

    if (rawTokenCount === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Create Subagent Context Packet cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.context_packet_created',
        commandId: 'witness.createSubagentContextPacket',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession, task_ordinal: taskOrdinal },
      });
      return;
    }

    // ---------------------------------------------------------------------------
    // Process collected inputs
    // ---------------------------------------------------------------------------

    // Source files: each non-blank item becomes a table row.
    const sourceFilePaths = rawSourceFiles
      .split(/[\n,]+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const sourceFilesTableBody =
      sourceFilePaths.length > 0
        ? sourceFilePaths.map(p => `| ${p} | (reason TBD) |`).join('\n')
        : '| (none) | — |';

    // Witness artifacts: each non-blank item becomes a table row.
    const artifactPaths = rawArtifacts
      .split(/[\n,]+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const artifactsTableBody =
      artifactPaths.length > 0
        ? artifactPaths.map(p => `| ${p} | (reason TBD) |`).join('\n')
        : '| (none) | — |';

    // Excluded context: use input or fall back to "(none)".
    const excludedText =
      rawExcluded.trim().length > 0
        ? `- ${rawExcluded.trim()}`
        : '- (none)';

    // Token count: number or sentinel string.
    const tokenCountTrimmed = rawTokenCount.trim();
    const estimatedTokenCount =
      tokenCountTrimmed.length > 0 ? Number(tokenCountTrimmed) : null;
    const tokenCountDisplay =
      estimatedTokenCount !== null ? String(estimatedTokenCount) : '(not measured)';

    // Session reference (optional — null when no active session).
    const sessionRef = sessionId ?? '(no active session)';

    // ---------------------------------------------------------------------------
    // Template substitution
    // ---------------------------------------------------------------------------

    // Placeholders substituted here:
    //   {{SUBAGENT_ID}}                           — every occurrence
    //   {{SESSION_ID}}                            — every occurrence
    //   {{YYYY-MM-DDTHH:MM:SSZ}}                  — every occurrence (Created At)
    //   | {{FILE_PATH}} | {{why this file is needed}} |   — source files table row
    //   | {{ARTIFACT_PATH}} | {{why it is needed}} |      — artifacts table row
    //   {{CURRENT_STATE_REFERENCE}}               — fixed note
    //   - {{EXCLUDED_ITEM}}: {{reason for exclusion}}  — excluded context item
    //   {{ESTIMATED_TOKEN_COUNT}}                 — count or "(not measured)"
    //
    // Intentionally left for user to fill in:
    //   {{ADR_REFERENCE}}, {{NOTES}}

    let content = await loadTemplate(context, 'subagent-context-packet-template.md');
    const createdAt = formatLocalTimestamp();

    content = replaceAll(content, '{{SUBAGENT_ID}}', subagentId);
    content = replaceAll(content, '{{SESSION_ID}}', sessionRef);
    content = replaceAll(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', createdAt);
    content = replaceAll(
      content,
      '| {{FILE_PATH}} | {{why this file is needed}} |',
      sourceFilesTableBody
    );
    content = replaceAll(
      content,
      '| {{ARTIFACT_PATH}} | {{why it is needed}} |',
      artifactsTableBody
    );
    content = replaceAll(
      content,
      '{{CURRENT_STATE_REFERENCE}}',
      '(see .witness/current-state.md if applicable)'
    );
    content = replaceAll(
      content,
      '- {{EXCLUDED_ITEM}}: {{reason for exclusion}}',
      excludedText
    );
    content = replaceAll(content, '{{ESTIMATED_TOKEN_COUNT}}', tokenCountDisplay);

    // ---------------------------------------------------------------------------
    // Write context-packet.md (create or overwrite — context assembly is iterative)
    // ---------------------------------------------------------------------------

    const contextPacketUri = getSubagentLedgerStageUri(
      workspaceRoot,
      taskOrdinal,
      'context-packet'
    );
    await vscode.workspace.fs.writeFile(contextPacketUri, encoder.encode(content));

    // Open in editor.
    const doc = await vscode.workspace.openTextDocument(contextPacketUri);
    await vscode.window.showTextDocument(doc);

    // ---------------------------------------------------------------------------
    // Telemetry — success
    // ---------------------------------------------------------------------------

    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.subagent_task.context_packet_created',
      commandId: 'witness.createSubagentContextPacket',
      sessionId: sessionId ?? null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, contextPacketUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        task_ordinal: taskOrdinal,
        estimated_token_count: estimatedTokenCount,
        had_active_session: hadActiveSession,
        had_contract: true,
        ledger_format: 'ledger',
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Context packet created for ${subagentId}.`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.subagent_task.context_packet_created',
      commandId: 'witness.createSubagentContextPacket',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Create Subagent Context Packet failed — ${message}`
    );
  }
}
