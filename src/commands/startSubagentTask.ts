import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, writeFileIfMissing } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  getNextSubagentOrdinal,
  getSubagentLedgerDir,
  getSubagentLedgerStageUri,
  formatSubagentId,
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
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Start Subagent Task` command.
 *
 * Prompts for a task goal and acceptance criteria, then writes a new
 * `subagent-NNN/contract.md` ledger entry under `.witness/subagents/`.
 * The ordinal is drawn from the project-wide sequential counter that spans
 * both v1 flat files and v2 ledger directories.
 */
export async function startSubagentTask(context: vscode.ExtensionContext): Promise<void> {
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

    // 3. Active session is optional — record as parent if present.
    const sessionId = await getCurrentSessionId(witnessRoot);
    const sessionRef = sessionId ?? '(no active session)';
    const hadActiveSession = sessionId !== undefined;

    // 4. Prompt for task goal (required).
    const rawGoal = await vscode.window.showInputBox({
      title: 'Witness: Start Subagent Task',
      prompt: 'Task goal — what should the subagent accomplish?',
      placeHolder: 'Refactor the authentication module to use the new token service',
      ignoreFocusOut: true,
    });

    if (rawGoal === undefined || rawGoal.trim().length === 0) {
      vscode.window.showInformationMessage('Witness: Start Subagent Task cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.started',
        commandId: 'witness.startSubagentTask',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: hadActiveSession },
      });
      return;
    }
    const taskGoal = rawGoal.trim();

    // 5. Prompt for acceptance criteria (required).
    //    User enters criteria separated by newlines or commas.
    const rawCriteria = await vscode.window.showInputBox({
      title: 'Witness: Start Subagent Task',
      prompt: 'Acceptance criteria — one per line, or comma-separated',
      placeHolder: 'All tests pass, No new TypeScript errors',
      ignoreFocusOut: true,
    });

    if (rawCriteria === undefined || rawCriteria.trim().length === 0) {
      vscode.window.showInformationMessage('Witness: Start Subagent Task cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent_task.started',
        commandId: 'witness.startSubagentTask',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          had_active_session: hadActiveSession,
          goal_length: taskGoal.length,
        },
      });
      return;
    }
    const criteriaRaw = rawCriteria.trim();

    // Format criteria: split on newlines and commas, filter blanks, prefix each with
    // the GitHub-style checkbox marker.
    const criteriaLines = criteriaRaw
      .split(/[\n,]+/)
      .map(c => c.trim())
      .filter(c => c.length > 0)
      .map(c => `- [ ] ${c}`)
      .join('\n');

    // 6. Compute the next project-wide ordinal (spans v1 flat files + v2 ledger dirs).
    const nextOrdinal = await getNextSubagentOrdinal(workspaceRoot);
    const subagentId = formatSubagentId(nextOrdinal);

    // 7. Ensure .witness/subagents/subagent-NNN/ directory exists.
    const ledgerDir = getSubagentLedgerDir(workspaceRoot, nextOrdinal);
    await ensureDir(ledgerDir);

    // 8. Load the contract template and substitute placeholders.
    //
    //    Placeholders substituted here:
    //      {{SUBAGENT_ID}}                     — every occurrence (header + body field)
    //      {{SESSION_ID}}                      — every occurrence (body field)
    //      {{YYYY-MM-DDTHH:MM:SSZ}}            — every occurrence (Created At field)
    //      {{TASK_GOAL}}                       — body field
    //      - [ ] {{CRITERION_1}}               — criteria block (both lines replaced together)
    //      - [ ] {{CRITERION_2}}
    //
    //    Intentionally left for user to fill in via editor:
    //      {{IN_SCOPE_1}}, {{OUT_OF_SCOPE_1}}, {{ITEM}}, {{DO_NOT_TOUCH_1}},
    //      {{EXPECTED_EVIDENCE}}, {{DISPATCH_NOTES}}

    let content = await loadTemplate(context, 'subagent-contract-template.md');
    const issuedAt = formatLocalTimestamp();

    content = replaceAll(content, '{{SUBAGENT_ID}}', subagentId);
    content = replaceAll(content, '{{SESSION_ID}}', sessionRef);
    content = replaceAll(content, '{{YYYY-MM-DDTHH:MM:SSZ}}', issuedAt);
    content = replaceAll(content, '{{TASK_GOAL}}', taskGoal);
    // Replace the two-line criteria placeholder block with user-supplied criteria.
    content = replaceAll(
      content,
      '- [ ] {{CRITERION_1}}\n- [ ] {{CRITERION_2}}',
      criteriaLines
    );

    // 9. Write contract.md — only if missing (avoid overwriting a concurrent write).
    const contractUri = getSubagentLedgerStageUri(workspaceRoot, nextOrdinal, 'contract');
    const written = await writeFileIfMissing(contractUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Start Subagent Task failed — contract.md already exists for ${subagentId}.`
      );
      return;
    }

    // 10. Open the contract in the editor.
    const doc = await vscode.workspace.openTextDocument(contractUri);
    await vscode.window.showTextDocument(doc);

    // 11. Emit success telemetry.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.subagent_task.started',
      commandId: 'witness.startSubagentTask',
      sessionId: sessionId ?? null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, contractUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        task_ordinal: nextOrdinal,
        goal_length: taskGoal.length,
        criteria_length: criteriaRaw.length,
        had_active_session: hadActiveSession,
        ledger_format: 'ledger',
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Subagent task ${subagentId} created.`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.subagent_task.started',
      commandId: 'witness.startSubagentTask',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Start Subagent Task failed — ${message}`
    );
  }
}
