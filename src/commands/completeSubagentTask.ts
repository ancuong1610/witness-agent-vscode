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
// Completion status options
// ---------------------------------------------------------------------------

const COMPLETION_STATUS_OPTIONS = [
  'complete',
  'complete-with-warnings',
  'blocked',
  'failed',
] as const;

type CompletionStatus = typeof COMPLETION_STATUS_OPTIONS[number];

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Complete Subagent Task` command.
 *
 * Lists all v2 ledger entries that have a contract but no report, prompts for
 * a completion status, then writes `report.md` from the template and opens it
 * in the editor for the developer to fill in the remaining detail sections.
 */
export async function completeSubagentTask(
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

    // 4. List all v2 ledger entries, keep those with a contract but no report.
    const allEntries = await listSubagentLedgerEntries(workspaceRoot);
    const withContract = filterLedgerEntriesByPresentStage(allEntries, 'contract');
    const eligible = filterLedgerEntriesByMissingStage(withContract, 'report');

    if (eligible.length === 0) {
      vscode.window.showInformationMessage(
        'Witness: No subagent tasks need a completion report. ' +
        'Start a subagent task first or choose a task without report.md.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.completed',
        commandId: 'witness.completeSubagentTask',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession },
      });
      return;
    }

    // 5. Build QuickPick items. Entries with evidence present are flagged so the
    //    developer can see the ledger state at a glance.
    const items: SubagentPickItem[] = eligible.map(entry => {
      const hasContextPacket = entry.presentStages.includes('context-packet');
      const hasEvidence = entry.presentStages.includes('evidence');
      const flags = [
        `contract ✓`,
        hasContextPacket ? 'context-packet ✓' : 'context-packet missing',
        hasEvidence ? 'evidence ✓' : 'evidence missing',
        'report missing',
      ].join('  ·  ');
      return { label: entry.id, description: flags, entry };
    });

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Witness: Complete Subagent Task',
      placeHolder: 'Select the subagent task to mark as complete',
      ignoreFocusOut: true,
    });

    if (selected === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Complete Subagent Task cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.completed',
        commandId: 'witness.completeSubagentTask',
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
    const hadEvidence = entry.presentStages.includes('evidence');

    // 6. Prompt for completion status.
    const statusPick = await vscode.window.showQuickPick(
      [...COMPLETION_STATUS_OPTIONS],
      {
        title: `Witness: Completion Status for ${subagentId}`,
        placeHolder: 'Select the completion status',
        ignoreFocusOut: true,
      }
    );

    if (statusPick === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Complete Subagent Task cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.completed',
        commandId: 'witness.completeSubagentTask',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession },
      });
      return;
    }

    const completionStatus = statusPick as CompletionStatus;

    // 7. Map status to the template's {{STATUS}} placeholder value.
    //    The template uses all-caps: COMPLETED / PARTIAL / FAILED.
    //    We map our four internal values to those three display values.
    const statusDisplay: Record<CompletionStatus, string> = {
      'complete': 'COMPLETED',
      'complete-with-warnings': 'COMPLETED',
      'blocked': 'PARTIAL',
      'failed': 'FAILED',
    };

    // 8. Load the completion report template and substitute core placeholders.
    //
    //    Placeholders substituted here:
    //      {{SUBAGENT_ID}}            — every occurrence
    //      {{SESSION_ID}}             — every occurrence
    //      {{YYYY-MM-DDTHH:MM:SSZ}}   — every occurrence (Completed At)
    //      {{COMPLETED / PARTIAL / FAILED}}  — Status field
    //
    //    Intentionally left for manual fill-in:
    //      {{OUTPUT_NAME}}, {{CRITERION_1}}, {{CRITERION_2}}, {{DECISION}},
    //      {{KNOWN_GAPS}}, {{FOLLOW_UP_1}}, {{ADDITIONAL_EVIDENCE_LINK}}

    let content = await loadTemplate(context, 'subagent-completion-report-template.md');
    const completedAt = formatLocalTimestamp();
    const sessionRef = sessionId ?? '(no active session)';

    content = replaceAll(content, '{{SUBAGENT_ID}}', subagentId);
    content = replaceAll(content, '{{SESSION_ID}}', sessionRef);
    content = replaceAll(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', completedAt);
    content = replaceAll(
      content,
      '{{COMPLETED / PARTIAL / FAILED}}',
      statusDisplay[completionStatus]
    );

    // 9. Compute missing stages for telemetry (after writing report, 'report' will be present).
    //    Use the current entry's missingStages minus 'report' (which we are writing now),
    //    then add any remaining missing stages.
    const missingAfterWrite = entry.missingStages.filter(s => s !== 'report');

    // 10. Write report.md — only if missing.
    const reportUri = getSubagentLedgerStageUri(workspaceRoot, taskOrdinal, 'report');
    const written = await writeFileIfMissing(reportUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Complete Subagent Task failed — report.md already exists for ${subagentId}.`
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.completed',
        commandId: 'witness.completeSubagentTask',
        sessionId: sessionId ?? null,
        status: 'error',
        durationMs: elapsed(),
        attributes: {
          task_ordinal: taskOrdinal,
          status: completionStatus,
          had_active_session: hadActiveSession,
          had_contract: true,
          had_context_packet: hadContextPacket,
          had_evidence: hadEvidence,
          missing_stages: missingAfterWrite,
          ledger_format: 'ledger',
        },
      });
      return;
    }

    // 11. Open in editor.
    const doc = await vscode.workspace.openTextDocument(reportUri);
    await vscode.window.showTextDocument(doc);

    // 12. Emit success telemetry.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.subagent_task.completed',
      commandId: 'witness.completeSubagentTask',
      sessionId: sessionId ?? null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, reportUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        task_ordinal: taskOrdinal,
        status: completionStatus,
        had_active_session: hadActiveSession,
        had_contract: true,
        had_context_packet: hadContextPacket,
        had_evidence: hadEvidence,
        missing_stages: missingAfterWrite,
        ledger_format: 'ledger',
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Completion report created for ${subagentId} (${completionStatus}).`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.subagent_task.completed',
      commandId: 'witness.completeSubagentTask',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Complete Subagent Task failed — ${message}`
    );
  }
}
