import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, readFile, writeFileIfMissing } from '../core/artifactWriter';
import { getCurrentSessionId } from '../core/sessionRegistry';
import { validateHandover, ValidationIssue } from '../core/handoverValidator';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalTimestamp } from '../core/time';

// ---------------------------------------------------------------------------
// validateHandover.ts — command implementation
// ---------------------------------------------------------------------------
// Note: the exported function is named `validateHandoverCmd` (with Cmd suffix)
// to avoid a name collision with `validateHandover` imported from the validator
// module above.
// ---------------------------------------------------------------------------

/**
 * Escapes a string for safe use inside a `RegExp` constructor.
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

/**
 * Scans a directory for files matching a regex and returns the filename with
 * the highest captured ordinal group (group 1).
 * Returns undefined if no matching file is found.
 */
function pickHighestOrdinal(
  entries: [string, vscode.FileType][],
  pattern: RegExp
): string | undefined {
  let maxOrdinal = -1;
  let bestFile: string | undefined;

  for (const [name] of entries) {
    const match = pattern.exec(name);
    if (match) {
      const ordinal = parseInt(match[1], 10);
      if (ordinal > maxOrdinal) {
        maxOrdinal = ordinal;
        bestFile = name;
      }
    }
  }

  return bestFile;
}

/**
 * Renders a validation report as a markdown string.
 */
function renderValidationReport(
  handoverName: string,
  handoverRelPath: string,
  passed: boolean,
  issues: ValidationIssue[]
): string {
  const validatedAt = formatLocalTimestamp();
  const resultLabel = passed ? 'PASSED' : 'FAILED';

  const errors = issues.filter(i => i.severity === 'ERROR');
  const warnings = issues.filter(i => i.severity === 'WARNING');

  const lines: string[] = [
    '# Handover Validation Report',
    '',
    `**Handover**: ${handoverRelPath}`,
    `**Validated At**: ${validatedAt}`,
    `**Result**: ${resultLabel}`,
    '',
    '---',
    '',
    '## Summary',
    '',
    `${errors.length} error(s), ${warnings.length} warning(s).`,
    '',
  ];

  if (passed) {
    lines.push('The handover is internally consistent and ready to use.');
  } else {
    lines.push('Fix the errors below before sharing this handover.');
  }

  lines.push('', '---', '', '## Issues', '');

  if (issues.length === 0) {
    lines.push('None.');
  } else {
    if (errors.length > 0) {
      lines.push('### Errors', '');
      for (const issue of errors) {
        const loc = issue.location ?? 'n/a';
        lines.push(`- [${issue.category}] ${issue.message}  (location: ${loc})`);
      }
      lines.push('');
    }

    if (warnings.length > 0) {
      lines.push('### Warnings', '');
      for (const issue of warnings) {
        const loc = issue.location ?? 'n/a';
        lines.push(`- [${issue.category}] ${issue.message}  (location: ${loc})`);
      }
      lines.push('');
    }
  }

  void handoverName; // included in handoverRelPath
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Validate Handover` command.
 *
 * Locates the most recent handover (preferring `latest.md`, falling back to
 * the highest-ordinal `handover-<session-id>-NNN.md` for the active session),
 * runs all validation rules, and writes a detailed report to
 * `.witness/evaluation/handover-<id>-validation-NNN.md`. Opens the report
 * in the editor.
 *
 * Does NOT modify the handover file. The report is the only output artifact.
 */
export async function validateHandoverCmd(context: vscode.ExtensionContext): Promise<void> {
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

    // 3. Locate the handover to validate.
    //    Priority: latest.md > highest-ordinal for active session > error.
    const handoversDir = vscode.Uri.joinPath(witnessRoot, 'handovers');
    const latestUri = vscode.Uri.joinPath(handoversDir, 'latest.md');

    let handoverUri: vscode.Uri | undefined;
    let handoverName: string | undefined;       // filename without directory, for display
    let handoverBaseName: string | undefined;   // filename without .md extension, for report naming

    let latestExists = false;
    try {
      await vscode.workspace.fs.stat(latestUri);
      latestExists = true;
    } catch {
      latestExists = false;
    }

    if (latestExists) {
      handoverUri = latestUri;
      handoverName = 'latest.md';
      handoverBaseName = 'latest';
    } else {
      // Fall back to highest-ordinal file for the active session.
      const sessionId = await getCurrentSessionId(witnessRoot);

      if (sessionId !== undefined) {
        const entries = await safeReadDirectory(handoversDir);
        const escaped = escapeRegExp(sessionId);
        const pattern = new RegExp(`^handover-${escaped}-(\\d{3})\\.md$`);
        const found = pickHighestOrdinal(entries, pattern);

        if (found !== undefined) {
          handoverUri = vscode.Uri.joinPath(handoversDir, found);
          handoverName = found;
          handoverBaseName = found.replace(/\.md$/, '');
        }
      }

      if (
        handoverUri === undefined ||
        handoverName === undefined ||
        handoverBaseName === undefined
      ) {
        vscode.window.showErrorMessage(
          'Witness: No handover found. Run "Witness: Generate Handover" first.'
        );
        return;
      }
    }

    if (
      handoverUri === undefined ||
      handoverName === undefined ||
      handoverBaseName === undefined
    ) {
      vscode.window.showErrorMessage(
        'Witness: Validate Handover failed — handover selection metadata missing.'
      );
      return;
    }

    // 4. Read the handover content.
    let handoverContent: string;
    try {
      handoverContent = await readFile(handoverUri);
    } catch {
      vscode.window.showErrorMessage(
        `Witness: Validate Handover failed — Cannot read handover file: ${handoverUri.fsPath}`
      );
      return;
    }

    const handoverRelPath = `.witness/handovers/${handoverName}`;

    // 5. Run the validator.
    const result = await validateHandover(handoverContent, handoverUri.fsPath, witnessRoot);

    // 6. Compute the next validation report ordinal.
    const evaluationDir = vscode.Uri.joinPath(witnessRoot, 'evaluation');
    await ensureDir(evaluationDir);

    const evalEntries = await safeReadDirectory(evaluationDir);
    const evalPattern = /^handover-.*-validation-(\d{3})\.md$/;
    let maxEvalOrdinal = 0;
    for (const [name] of evalEntries) {
      const m = evalPattern.exec(name);
      if (m) {
        const ordinal = parseInt(m[1], 10);
        if (ordinal > maxEvalOrdinal) {
          maxEvalOrdinal = ordinal;
        }
      }
    }
    const validationNNN = String(maxEvalOrdinal + 1).padStart(3, '0');

    // 7. Render the validation report.
    const reportContent = renderValidationReport(
      handoverName,
      handoverRelPath,
      result.passed,
      result.issues
    );

    // 8. Write the report.
    const reportFilename = `handover-${handoverBaseName}-validation-${validationNNN}.md`;
    const reportUri = vscode.Uri.joinPath(evaluationDir, reportFilename);
    const written = await writeFileIfMissing(reportUri, reportContent);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Validate Handover failed — Report file already exists: ${reportUri.fsPath}`
      );
      return;
    }

    // 9. Open the report in the editor.
    const doc = await vscode.workspace.openTextDocument(reportUri);
    await vscode.window.showTextDocument(doc);

    // 10. Info message.
    const errors = result.issues.filter(i => i.severity === 'ERROR');
    const warnings = result.issues.filter(i => i.severity === 'WARNING');

    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.handover.validated',
      commandId: 'witness.validateHandover',
      sessionId: null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, reportUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        source_was_latest: latestExists,
        validation_passed: result.passed,
        error_count: errors.length,
        warning_count: warnings.length,
        validation_ordinal: maxEvalOrdinal + 1,
      },
    });
    if (result.passed) {
      vscode.window.showInformationMessage(
        `Witness: Validation PASSED for ${handoverName}.`
      );
    } else {
      vscode.window.showInformationMessage(
        `Witness: Validation FAILED for ${handoverName} — ${errors.length} error(s), ${warnings.length} warning(s).`
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.handover.validated',
      commandId: 'witness.validateHandover',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(`Witness: Validate Handover failed — ${message}`);
  }
}
