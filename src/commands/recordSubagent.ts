import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, writeFileIfMissing } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';

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
 * Implementation of the `Witness: Record Subagent Report` command.
 *
 * Prompts for a subagent identifier, model, and task summary, then writes a
 * new `subagent-NNN.md` file to `.witness/subagents/` using the project-wide
 * sequential three-digit ordinal. Active session is optional — recorded as
 * parent if present, otherwise noted as `(no active session)`.
 */
export async function recordSubagent(context: vscode.ExtensionContext): Promise<void> {
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

    // 4. Prompt for Subagent ID.
    const rawSubagentId = await vscode.window.showInputBox({
      prompt: 'Subagent identifier (free text, e.g. "sonnet-explore-vscode-api")',
      placeHolder: 'sonnet-explore-vscode-api',
      ignoreFocusOut: true,
    });

    if (rawSubagentId === undefined || rawSubagentId.trim().length === 0) {
      vscode.window.showInformationMessage('Witness: Record Subagent Report cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent.report_recorded',
        commandId: 'witness.recordSubagent',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: sessionId !== undefined },
      });
      return;
    }
    const subagentId = rawSubagentId.trim();

    // 5. Prompt for Model Used.
    const modelUsed = await vscode.window.showQuickPick(
      ['haiku', 'sonnet', 'opus', 'other'],
      {
        title: 'Model used by the subagent',
        placeHolder: 'Select the model',
        ignoreFocusOut: true,
      }
    );

    if (modelUsed === undefined) {
      vscode.window.showInformationMessage('Witness: Record Subagent Report cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent.report_recorded',
        commandId: 'witness.recordSubagent',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: sessionId !== undefined },
      });
      return;
    }

    // 6. Prompt for Task Given.
    const rawTaskGiven = await vscode.window.showInputBox({
      prompt: 'One-line summary of what the subagent was asked to do',
      placeHolder: 'Search the codebase for all uses of vscode.workspace.fs',
      ignoreFocusOut: true,
    });

    if (rawTaskGiven === undefined || rawTaskGiven.trim().length === 0) {
      vscode.window.showInformationMessage('Witness: Record Subagent Report cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.subagent.report_recorded',
        commandId: 'witness.recordSubagent',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          had_active_session: sessionId !== undefined,
          model_used: modelUsed,
        },
      });
      return;
    }
    const taskGiven = rawTaskGiven.trim();

    // 7. Compute next subagent ordinal by scanning .witness/subagents/ for
    //    files matching ^subagent-(\d{3})\.md$ (three-digit, project-wide sequential).
    const subagentsDir = vscode.Uri.joinPath(witnessRoot, 'subagents');
    await ensureDir(subagentsDir);

    const subagentPattern = /^subagent-(\d{3})\.md$/;
    let maxOrdinal = 0;

    try {
      const entries = await vscode.workspace.fs.readDirectory(subagentsDir);
      for (const [name] of entries) {
        const match = subagentPattern.exec(name);
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
    const subagentFilename = `subagent-${nnn}.md`;

    // 8. Load subagent-report-template.md and substitute placeholders.
    //
    //    Verified template placeholders (from src/templates/subagent-report-template.md):
    //
    //    {{SUBAGENT_ID}}                       — Subagent ID field.
    //                                            Substituted with user-entered identifier.
    //    {{SESSION_ID}}                         — Parent Session field.
    //                                            Substituted with current session ID, or
    //                                            "(no active session)" if none.
    //    {{MODEL_NAME_AND_VERSION}}             — Model Used field.
    //                                            Substituted with chosen model string.
    //    {{TASK_DESCRIPTION}}                   — Task Given field.
    //                                            Substituted with user-entered task summary.
    //
    //    Intentionally left for user to fill in via editor:
    //    {{INPUT_NAME}}                         — Inputs table: input name.
    //    {{file / snippet / instruction / artifact}} — Inputs table: input type.
    //    {{brief description}}                  — Inputs table: input description.
    //    {{ONE_PARAGRAPH_SUMMARY_OF_OUTPUT}}    — Outputs: summary paragraph.
    //    {{FULL_OUTPUT_OR_OMIT_IF_LINKED}}      — Outputs: full output or link.
    //    {{path/to/output/file}}                — Outputs: output file path.
    //    {{FILE_PATH}}                          — Files Changed: file path.
    //    {{created/modified/deleted}}           — Files Changed: change type.
    //    {{notes}}                              — Files Changed: notes.
    //    {{DECISION}}                           — Decisions: decision text.
    //    {{ADR link or "none"}}                 — Decisions: ADR link.
    //    {{context}}                            — Decisions: decision context.
    //    {{yes / no / partial}}                 — Integration status.
    //    {{INTEGRATION_NOTES}}                  — Integration notes.
    //    {{QUALITY_ASSESSMENT}}                 — Quality Notes.
    //
    //    NOTE: The template does NOT have a generated timestamp placeholder.
    //    No timestamp substitution is performed.

    let content = await loadTemplate(context, 'subagent-report-template.md');

    const generatedAt = new Date().toISOString();
    // TODO: The template has no {{GENERATED_AT}} or timestamp placeholder.
    // If a timestamp field is added to the template in future, substitute generatedAt here.
    void generatedAt;

    content = replaceAll(content, '{{SUBAGENT_ID}}', subagentId);
    content = replaceAll(content, '{{SESSION_ID}}', sessionRef);
    content = replaceAll(content, '{{MODEL_NAME_AND_VERSION}}', modelUsed);
    content = replaceAll(content, '{{TASK_DESCRIPTION}}', taskGiven);

    // 9. Write the file to .witness/subagents/subagent-NNN.md.
    const subagentUri = vscode.Uri.joinPath(subagentsDir, subagentFilename);
    const written = await writeFileIfMissing(subagentUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Record Subagent Report failed — File already exists: ${subagentUri.fsPath}`
      );
      return;
    }

    // 10. Open it in the editor.
    const doc = await vscode.workspace.openTextDocument(subagentUri);
    await vscode.window.showTextDocument(doc);

    // 11. Confirm success.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.subagent.report_recorded',
      commandId: 'witness.recordSubagent',
      sessionId: sessionId ?? null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, subagentUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        had_active_session: sessionId !== undefined,
        model_used: modelUsed,
        task_length: taskGiven.length,
        subagent_ordinal: nextOrdinal,
        ledger_format: 'flat',
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Subagent report ${nnn} created (${subagentId}).`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.subagent.report_recorded',
      commandId: 'witness.recordSubagent',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Record Subagent Report failed — ${message}`
    );
  }
}
