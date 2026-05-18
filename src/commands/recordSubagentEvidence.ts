import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { writeFileIfMissing } from '../core/artifactWriter';
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
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Record Subagent Evidence` command.
 *
 * Lists all v2 ledger entries that have a contract but no evidence file.
 * Entries with a context-packet are listed first (preferred). The developer
 * selects an entry and `evidence.md` is created and opened for manual fill-in.
 */
export async function recordSubagentEvidence(
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

    // 4. List all v2 ledger entries, keep those with a contract but no evidence.
    const allEntries = await listSubagentLedgerEntries(workspaceRoot);
    const withContract = filterLedgerEntriesByPresentStage(allEntries, 'contract');
    const eligible = filterLedgerEntriesByMissingStage(withContract, 'evidence');

    if (eligible.length === 0) {
      vscode.window.showInformationMessage(
        'Witness: No subagent tasks need evidence. ' +
        'Start a subagent task first or choose a task without evidence.md.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.evidence_recorded',
        commandId: 'witness.recordSubagentEvidence',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession },
      });
      return;
    }

    // 5. Build QuickPick items. Entries with a context-packet are marked as
    //    preferred in their description so they appear more informative.
    //    The list is already sorted ascending by ordinal from listSubagentLedgerEntries.
    const items: SubagentPickItem[] = eligible.map(entry => {
      const hasContextPacket = entry.presentStages.includes('context-packet');
      return {
        label: entry.id,
        description: hasContextPacket
          ? 'contract ✓  ·  context-packet ✓  ·  evidence missing'
          : 'contract ✓  ·  context-packet missing  ·  evidence missing',
        entry,
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Witness: Record Subagent Evidence',
      placeHolder: 'Select the subagent task to record evidence for',
      ignoreFocusOut: true,
    });

    if (selected === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Record Subagent Evidence cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.evidence_recorded',
        commandId: 'witness.recordSubagentEvidence',
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
    const hadContextPacket = entry.presentStages.includes('context-packet');

    // 6. Load the evidence template and substitute core placeholders.
    //
    //    Placeholders substituted here:
    //      {{SUBAGENT_ID}}            — every occurrence
    //      {{SESSION_ID}}             — every occurrence
    //      {{YYYY-MM-DDTHH:MM:SSZ}}   — every occurrence (Recorded At)
    //
    //    Intentionally left for manual fill-in:
    //      {{FILE_PATH}}, {{ACTIONS_TAKEN}}, {{DECISION}}, {{DEVIATIONS}},
    //      {{VERIFICATION_OUTPUT}}, {{ASSUMPTION_1}}, {{OPEN_QUESTION_1}}

    let content = await loadTemplate(context, 'subagent-evidence-template.md');
    const recordedAt = formatLocalTimestamp();
    const sessionRef = sessionId ?? '(no active session)';

    content = replaceAll(content, '{{SUBAGENT_ID}}', subagentId);
    content = replaceAll(content, '{{SESSION_ID}}', sessionRef);
    content = replaceAll(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', recordedAt);

    // 7. Write evidence.md — only if missing (filter should have ensured this, but guard anyway).
    const evidenceUri = getSubagentLedgerStageUri(workspaceRoot, taskOrdinal, 'evidence');
    const written = await writeFileIfMissing(evidenceUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Record Subagent Evidence failed — evidence.md already exists for ${subagentId}.`
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.evidence_recorded',
        commandId: 'witness.recordSubagentEvidence',
        sessionId: sessionId ?? null,
        status: 'error',
        durationMs: elapsed(),
        attributes: {
          task_ordinal: taskOrdinal,
          had_active_session: hadActiveSession,
          had_contract: true,
          had_context_packet: hadContextPacket,
          ledger_format: 'ledger',
        },
      });
      return;
    }

    // 8. Open in editor.
    const doc = await vscode.workspace.openTextDocument(evidenceUri);
    await vscode.window.showTextDocument(doc);

    // 9. Emit success telemetry.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.subagent_task.evidence_recorded',
      commandId: 'witness.recordSubagentEvidence',
      sessionId: sessionId ?? null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, evidenceUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        task_ordinal: taskOrdinal,
        had_active_session: hadActiveSession,
        had_contract: true,
        had_context_packet: hadContextPacket,
        ledger_format: 'ledger',
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Evidence file created for ${subagentId}.`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.subagent_task.evidence_recorded',
      commandId: 'witness.recordSubagentEvidence',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Record Subagent Evidence failed — ${message}`
    );
  }
}
