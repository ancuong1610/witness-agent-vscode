import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, writeFileIfMissing } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import { getCurrentSessionId } from '../core/sessionRegistry';
import { slugify } from '../core/slugify';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalDate } from '../core/time';

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
 * Implementation of the `Witness: Create ADR` command.
 *
 * Prompts for a decision title, computes the next project-wide sequential ADR
 * number (four-digit zero-padded, format `ADR-NNNN-<slug>.md`), generates the
 * file from `adr-template.md`, writes it to `.witness/decisions/`, and opens
 * it in the editor. An active session is optional.
 */
export async function createADR(context: vscode.ExtensionContext): Promise<void> {
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

    // 3. Active session is optional — record it if present.
    const sessionId = await getCurrentSessionId(witnessRoot);
    const sessionRef = sessionId ?? '(no active session)';

    // 4. Prompt for the ADR title.
    const title = await vscode.window.showInputBox({
      prompt: 'ADR title (short, decision-focused)',
      placeHolder: 'e.g. Use TextEncoder for all file writes',
      ignoreFocusOut: true,
    });

    if (title === undefined || title.trim().length === 0) {
      vscode.window.showInformationMessage('Witness: Create ADR cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.adr.created',
        commandId: 'witness.createADR',
        sessionId: sessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { had_active_session: sessionId !== undefined },
      });
      return;
    }

    // 5. Compute the next ADR number by scanning .witness/decisions/ for existing ADRs.
    const decisionsDir = vscode.Uri.joinPath(witnessRoot, 'decisions');
    await ensureDir(decisionsDir);

    const adrPattern = /^ADR-(\d{4})-.+\.md$/;
    let maxAdrNum = 0;

    try {
      const entries = await vscode.workspace.fs.readDirectory(decisionsDir);
      for (const [name] of entries) {
        const match = adrPattern.exec(name);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxAdrNum) {
            maxAdrNum = num;
          }
        }
      }
    } catch {
      // Directory unreadable — treat as empty.
    }

    const nextNum = maxAdrNum + 1;
    const nnnn = String(nextNum).padStart(4, '0');

    // 6. Build the ADR ID and filename.
    const slug = slugify(title.trim(), 50);
    const adrId = `ADR-${nnnn}-${slug}`;
    const adrFilename = `${adrId}.md`;

    // 7. Load adr-template.md and substitute placeholders.
    //
    //    Verified template placeholders (from src/templates/adr-template.md):
    //
    //    {{NNN}}                          — ADR number, appears TWICE (H1 title + ADR Number section).
    //                                       Substituted with four-digit NNNN (e.g. "0001").
    //    {{TITLE}}                        — Title in the H1 heading. Substituted with user title.
    //    {{DECISION_TITLE}}               — Title in the ## Title section. Substituted with user title.
    //    {{YYYY-MM-DD}}                   — Date field. Substituted with today's local date.
    //    {{Proposed / Accepted / Superseded}} — Status field. Substituted with "Proposed".
    //
    //    Intentionally left for user to fill in:
    //    {{CONTEXT}}                      — Context section body.
    //    {{DECISION}}                     — Decision section body.
    //    {{POSITIVE_CONSEQUENCE_1}}       — Positive consequences list item.
    //    {{POSITIVE_CONSEQUENCE_2}}       — Positive consequences list item.
    //    {{NEGATIVE_CONSEQUENCE_1}}       — Negative consequences list item.
    //    {{NEGATIVE_CONSEQUENCE_2}}       — Negative consequences list item.
    //    {{ALTERNATIVE_1}}                — Alternatives table row.
    //    {{ALTERNATIVE_2}}                — Alternatives table row.
    //    {{reason}}                       — Alternatives table "Why Not Chosen" cells.
    //
    //    NOTE: The template does NOT contain a session-link placeholder. We append
    //    session reference as a standalone metadata line after the H1 heading instead.

    let content = await loadTemplate(context, 'adr-template.md');

    // Compute local date as YYYY-MM-DD.
    const localDate = formatLocalDate();

    // Substitute the ADR number (appears twice in the template).
    content = replaceAll(content, '{{NNN}}', nnnn);
    // Substitute the H1 title placeholder.
    content = replaceFirst(content, '{{TITLE}}', title.trim());
    // Substitute the ## Title section placeholder.
    content = replaceAll(content, '{{DECISION_TITLE}}', title.trim());
    // Substitute the date.
    content = replaceAll(content, '{{YYYY-MM-DD}}', localDate);
    // Substitute the status.
    content = replaceAll(content, '{{Proposed / Accepted / Superseded}}', 'Proposed');

    // Append session reference after the first heading line.
    // The template starts with `# ADR-{{NNN}}: {{TITLE}}\n`. After substitution
    // the first line becomes `# ADR-NNNN: <title>`. We insert the session ref
    // on the second line so it renders as part of the document header area.
    const firstNewline = content.indexOf('\n');
    if (firstNewline !== -1) {
      content =
        content.slice(0, firstNewline + 1) +
        `\n**Session**: ${sessionRef}\n` +
        content.slice(firstNewline + 1);
    }

    // 8. Write the ADR file (error if it somehow already exists).
    const adrUri = vscode.Uri.joinPath(decisionsDir, adrFilename);
    const written = await writeFileIfMissing(adrUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Create ADR failed — File already exists: ${adrUri.fsPath}`
      );
      return;
    }

    // 9. Open the file in the editor.
    const doc = await vscode.workspace.openTextDocument(adrUri);
    await vscode.window.showTextDocument(doc);

    // 10. Confirm success.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.adr.created',
      commandId: 'witness.createADR',
      sessionId: sessionId ?? null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, adrUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        had_active_session: sessionId !== undefined,
        adr_number: nextNum,
        slug_length: slug.length,
      },
    });
    vscode.window.showInformationMessage(`Witness: ${adrId} created.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.adr.created',
      commandId: 'witness.createADR',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(`Witness: Create ADR failed — ${message}`);
  }
}
