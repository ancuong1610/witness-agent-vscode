import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { writeFileIfMissing } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  SubagentLedgerEntry,
  SubagentLedgerStage,
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
// Review decision options
// ---------------------------------------------------------------------------

const REVIEW_DECISION_OPTIONS = [
  'accepted',
  'accepted-with-conditions',
  'rejected',
] as const;

type ReviewDecision = typeof REVIEW_DECISION_OPTIONS[number];

// ---------------------------------------------------------------------------
// All five stage names — used for ledger_complete and missing_stages computation
// ---------------------------------------------------------------------------

const ALL_STAGE_NAMES: SubagentLedgerStage[] = [
  'contract',
  'context-packet',
  'evidence',
  'report',
  'review',
];

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Review Subagent Task` command.
 *
 * Lists all v2 ledger entries that have a report but no review file, prompts
 * for a review decision, then writes `review.md` from the template and opens
 * it in the editor for the developer to fill in the integration detail sections.
 *
 * `ledger_complete` in telemetry is true only when all five stage files exist
 * after the review is written.
 */
export async function reviewSubagentTask(
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

    // 4. List all v2 ledger entries, keep those with a report but no review.
    const allEntries = await listSubagentLedgerEntries(workspaceRoot);
    const withReport = filterLedgerEntriesByPresentStage(allEntries, 'report');
    const eligible = filterLedgerEntriesByMissingStage(withReport, 'review');

    if (eligible.length === 0) {
      vscode.window.showInformationMessage(
        'Witness: No completed subagent tasks need review. ' +
        'Complete a subagent task first or choose a task without review.md.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.reviewed',
        commandId: 'witness.reviewSubagentTask',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession },
      });
      return;
    }

    // 5. Build QuickPick items showing the full stage state of each entry.
    const items: SubagentPickItem[] = eligible.map(entry => {
      const stageFlags = ALL_STAGE_NAMES.map(s =>
        entry.presentStages.includes(s) ? `${s} ✓` : `${s} missing`
      ).join('  ·  ');
      return { label: entry.id, description: stageFlags, entry };
    });

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Witness: Review Subagent Task',
      placeHolder: 'Select the subagent task to review',
      ignoreFocusOut: true,
    });

    if (selected === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Review Subagent Task cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.reviewed',
        commandId: 'witness.reviewSubagentTask',
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

    // 6. Prompt for review decision.
    const decisionPick = await vscode.window.showQuickPick(
      [...REVIEW_DECISION_OPTIONS],
      {
        title: `Witness: Review Decision for ${subagentId}`,
        placeHolder: 'Select the review decision',
        ignoreFocusOut: true,
      }
    );

    if (decisionPick === undefined) {
      vscode.window.showInformationMessage(
        'Witness: Review Subagent Task cancelled.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.reviewed',
        commandId: 'witness.reviewSubagentTask',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession },
      });
      return;
    }

    const decision = decisionPick as ReviewDecision;

    // 7. Map decision to the template's placeholder value.
    //    Template placeholder: {{ACCEPTED / ACCEPTED WITH CONDITIONS / REJECTED}}
    const decisionDisplay: Record<ReviewDecision, string> = {
      'accepted': 'ACCEPTED',
      'accepted-with-conditions': 'ACCEPTED WITH CONDITIONS',
      'rejected': 'REJECTED',
    };

    // 8. Load the review template and substitute core placeholders.
    //
    //    Placeholders substituted here:
    //      {{SUBAGENT_ID}}                              — every occurrence
    //      {{SESSION_ID}}                               — every occurrence
    //      {{YYYY-MM-DDTHH:MM:SSZ}}                     — every occurrence (Reviewed At)
    //      {{ACCEPTED / ACCEPTED WITH CONDITIONS / REJECTED}} — Review Decision field
    //
    //    Intentionally left for manual fill-in:
    //      {{REVIEW_DECISION_RATIONALE}}, {{ACTION}}, {{CONDITIONS_OR_REMEDIATION}},
    //      {{RESIDUAL_RISK}}, {{CURRENT_STATE_UPDATES}}, {{ADR_REFERENCE}}, {{FINAL_NOTES}}

    let content = await loadTemplate(context, 'subagent-review-template.md');
    const reviewedAt = formatLocalTimestamp();
    const sessionRef = sessionId ?? '(no active session)';

    content = replaceAll(content, '{{SUBAGENT_ID}}', subagentId);
    content = replaceAll(content, '{{SESSION_ID}}', sessionRef);
    content = replaceAll(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', reviewedAt);
    content = replaceAll(
      content,
      '{{ACCEPTED / ACCEPTED WITH CONDITIONS / REJECTED}}',
      decisionDisplay[decision]
    );

    // 9. Compute missing stages after this write completes.
    //    The 'review' stage is being written now, so exclude it from missing.
    //    All other stages still missing in entry.missingStages remain missing.
    const missingAfterWrite = entry.missingStages.filter(s => s !== 'review');

    // ledger_complete is true when no stages will remain missing after this write.
    const ledgerComplete = missingAfterWrite.length === 0;

    // 10. Write review.md — only if missing.
    const reviewUri = getSubagentLedgerStageUri(workspaceRoot, taskOrdinal, 'review');
    const written = await writeFileIfMissing(reviewUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Review Subagent Task failed — review.md already exists for ${subagentId}.`
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.reviewed',
        commandId: 'witness.reviewSubagentTask',
        sessionId: sessionId ?? null,
        status: 'error',
        durationMs: elapsed(),
        attributes: {
          task_ordinal: taskOrdinal,
          decision,
          had_active_session: hadActiveSession,
          missing_stages: missingAfterWrite,
          ledger_complete: ledgerComplete,
          ledger_format: 'ledger',
        },
      });
      return;
    }

    // 11. Open in editor.
    const doc = await vscode.workspace.openTextDocument(reviewUri);
    await vscode.window.showTextDocument(doc);

    // 12. Emit success telemetry.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.subagent_task.reviewed',
      commandId: 'witness.reviewSubagentTask',
      sessionId: sessionId ?? null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, reviewUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        task_ordinal: taskOrdinal,
        decision,
        had_active_session: hadActiveSession,
        missing_stages: missingAfterWrite,
        ledger_complete: ledgerComplete,
        ledger_format: 'ledger',
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Review created for ${subagentId} (${decision}).`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.subagent_task.reviewed',
      commandId: 'witness.reviewSubagentTask',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Review Subagent Task failed — ${message}`
    );
  }
}
