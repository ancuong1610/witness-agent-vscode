import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { getCurrentSessionId } from '../core/sessionRegistry';
import { generateEvaluationSummary } from '../core/evaluationSummary';
import { refreshWitnessStatusBar } from '../core/statusBar';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';

// ---------------------------------------------------------------------------
// generateEvaluationSummary.ts — Witness: Generate Evaluation Summary (v3.6).
// ---------------------------------------------------------------------------
//
// Requires an active session. Calls generateEvaluationSummary() from the core
// module, opens the resulting file in the editor, emits a telemetry event, and
// refreshes the status bar.
//
// No LLM calls. No network calls. Deterministic output from filesystem state.
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Generate Evaluation Summary` command.
 *
 * 1. Validates workspace and active session.
 * 2. Calls `generateEvaluationSummary(workspaceRoot, sessionId)`.
 * 3. Opens the generated markdown file in the editor.
 * 4. Emits `witness.evaluation_summary.generated` telemetry event.
 * 5. Refreshes the status bar.
 */
export async function generateEvaluationSummaryCmd(
  context: vscode.ExtensionContext
): Promise<void> {
  void context; // reserved for future use
  const elapsed = createCommandTimer();

  // Capture workspaceRoot early for error-path telemetry.
  const workspaceRoot = getWorkspaceRoot();

  try {
    // 1. Require an open workspace folder.
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      await emitWitnessEvent({
        workspaceRoot: undefined,
        eventName: 'witness.evaluation_summary.generated',
        commandId: 'witness.generateEvaluationSummary',
        sessionId: null,
        status: 'error',
        durationMs: elapsed(),
        attributes: { error: 'no_workspace' },
      });
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
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.evaluation_summary.generated',
        commandId: 'witness.generateEvaluationSummary',
        sessionId: null,
        status: 'error',
        durationMs: elapsed(),
        attributes: { error: 'no_witness_dir' },
      });
      return;
    }

    // 3. Require an active session.
    const sessionId = await getCurrentSessionId(witnessRoot);
    if (sessionId === undefined) {
      vscode.window.showErrorMessage(
        'Witness: No active session. Run "Witness: Start Session" first.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.evaluation_summary.generated',
        commandId: 'witness.generateEvaluationSummary',
        sessionId: null,
        status: 'error',
        durationMs: elapsed(),
        attributes: { error: 'no_active_session' },
      });
      return;
    }

    // 4. Generate the evaluation summary.
    const result = await generateEvaluationSummary(workspaceRoot, sessionId);

    // 5. Open the generated file in the editor.
    try {
      const doc = await vscode.workspace.openTextDocument(result.summaryUri);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {
      vscode.window.showErrorMessage(
        `Witness: Generate Evaluation Summary failed — Cannot open output file: ${result.summaryUri.fsPath}`
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.evaluation_summary.generated',
        commandId: 'witness.generateEvaluationSummary',
        sessionId,
        status: 'error',
        durationMs: elapsed(),
        attributes: { error: 'cannot_open_output' },
      });
      return;
    }

    // 6. Emit telemetry.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.evaluation_summary.generated',
      commandId: 'witness.generateEvaluationSummary',
      sessionId,
      artifactPaths: [
        `.witness/evaluation/${result.summaryUri.path.split('/').at(-1) ?? ''}`,
      ],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        session_id_present: true,
        telemetry_event_count: result.telemetryEventCount,
        distinct_command_count: result.distinctCommandIds.length,
        context_snapshot_count: result.contextSnapshotCount,
        handover_count: result.handoverCount,
        validation_report_count: result.validationReportCount,
        context_packet_count: result.contextPacketCount,
        subagent_total_count: result.subagentTotalCount,
        subagent_healthy_count: result.subagentHealthyCount,
        subagent_needs_review_count: result.subagentNeedsReviewCount,
        subagent_incomplete_count: result.subagentIncompleteCount,
        subagent_blocked_count: result.subagentBlockedCount,
        subagent_loop_risk_count: result.subagentLoopRiskCount,
        risk_assessment_count: result.riskAssessmentCount,
        latest_risk_level: result.latestRiskLevel ?? 'none',
      },
    });

    // 7. Refresh the status bar so it reflects any state changes.
    refreshWitnessStatusBar();

    vscode.window.showInformationMessage(
      `Witness: Evaluation summary generated for session ${sessionId}.`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.evaluation_summary.generated',
      commandId: 'witness.generateEvaluationSummary',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
      attributes: { error: 'unexpected' },
    });
    vscode.window.showErrorMessage(
      `Witness: Generate Evaluation Summary failed — ${message}`
    );
  }
}
