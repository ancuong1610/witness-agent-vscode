import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, readFile, writeFileIfMissing } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalTimestamp, formatLocalDate } from '../core/time';

// ---------------------------------------------------------------------------
// Local helpers (intentionally not shared — inlined per Task 006 spec)
// ---------------------------------------------------------------------------

/**
 * Escapes a string for safe use inside a `RegExp` constructor.
 * Same pattern as validateHandover.ts and observeWorkspace.ts.
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
 * Scans a directory listing for files matching a regex and returns the
 * filename with the highest captured ordinal group (group 1).
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

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Create Resume Probe` command.
 *
 * Locates the most recent handover (preferring `handovers/latest.md`, falling
 * back to the highest-ordinal `handover-<session-id>-NNN.md` for the active
 * session), extracts the handover ID from its content, computes the next
 * per-handover probe ordinal, renders `resume-probe-template.md` with ID
 * fields substituted, and writes the probe to `.witness/evaluation/`. Opens
 * the file in the editor.
 *
 * Expected Answers, Pass/Fail Criteria, and Result fields are left as
 * `{{...}}` placeholders for the user to fill in via the editor.
 */
export async function createResumeProbe(context: vscode.ExtensionContext): Promise<void> {
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

    // 3. Locate the source handover.
    //    Priority: latest.md > highest-ordinal for active session > error.
    const handoversDir = vscode.Uri.joinPath(witnessRoot, 'handovers');
    const latestUri = vscode.Uri.joinPath(handoversDir, 'latest.md');

    let handoverUri: vscode.Uri | undefined;
    /** true if the source was latest.md; false if it was a dated file */
    let sourceIsLatest = false;
    /** filename of the source handover (e.g. "latest.md" or "handover-2026-05-12-001-001.md") */
    let sourceFilename: string | undefined;

    let latestExists = false;
    try {
      await vscode.workspace.fs.stat(latestUri);
      latestExists = true;
    } catch {
      latestExists = false;
    }

    if (latestExists) {
      handoverUri = latestUri;
      sourceIsLatest = true;
      sourceFilename = 'latest.md';
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
          sourceIsLatest = false;
          sourceFilename = found;
        }
      }

      if (handoverUri === undefined || sourceFilename === undefined) {
        vscode.window.showErrorMessage(
          'Witness: No handover found. Run "Witness: Generate Handover" first.'
        );
        return;
      }
    }

    // 4. Read the handover content.
    let handoverContent: string;
    try {
      handoverContent = await readFile(handoverUri);
    } catch {
      vscode.window.showErrorMessage(
        `Witness: Create Resume Probe failed — Cannot read handover file: ${handoverUri.fsPath}`
      );
      return;
    }

    // 5. Extract the handover ID from the handover content.
    //    Locate the line "## Handover ID", then scan forward for the first
    //    non-blank, non-comment, non-heading line.
    let handoverId: string | undefined;
    // Tracks whether the handover ID was extracted from content or fell back to filename.
    let handoverIdSource: 'content' | 'filename' = 'content';

    const handoverLines = handoverContent.split('\n');
    let inHandoverIdSection = false;

    for (const rawLine of handoverLines) {
      const line = rawLine.trim();

      if (line === '## Handover ID') {
        inHandoverIdSection = true;
        continue;
      }

      if (inHandoverIdSection) {
        // Stop at the next heading (any level).
        if (line.startsWith('#')) {
          break;
        }
        // Skip blank lines, HTML comments, and placeholder values.
        if (
          line.length === 0 ||
          line.startsWith('<!--') ||
          /^\{\{/.test(line)
        ) {
          continue;
        }
        // This is the handover ID line.
        handoverId = line;
        break;
      }
    }

    // Fallback: use the filename stem if parsing produced nothing useful.
    if (!handoverId) {
      handoverIdSource = 'filename';
      if (sourceIsLatest) {
        handoverId = 'latest';
      } else {
        // sourceFilename is e.g. "handover-2026-05-12-001-001.md"
        handoverId = sourceFilename.replace(/\.md$/, '');
      }
    }

    // 6. Determine the session ID for the probe metadata.
    //    Try the active session first; fall back to extracting from the handover ID.
    let probeSessionId: string;
    const activeSessionId = await getCurrentSessionId(witnessRoot);

    if (activeSessionId !== undefined) {
      probeSessionId = activeSessionId;
    } else if (handoverId !== 'latest' && handoverId.startsWith('handover-')) {
      // Extract session ID from handover ID: "handover-YYYY-MM-DD-NNN-NNN" → "YYYY-MM-DD-NNN"
      // The handover ID format is: handover-<sessionId>-<probeOrdinal>
      // where sessionId is YYYY-MM-DD-NNN (4 segments) and probeOrdinal is the trailing NNN.
      // Strip the leading "handover-" prefix and the trailing "-NNN" ordinal.
      const withoutPrefix = handoverId.replace(/^handover-/, '');
      // Session ID is everything except the last "-NNN" segment.
      const lastDashIdx = withoutPrefix.lastIndexOf('-');
      probeSessionId = lastDashIdx !== -1
        ? withoutPrefix.slice(0, lastDashIdx)
        : withoutPrefix;
    } else {
      probeSessionId = '(unknown)';
    }

    // 7. Determine the link target for the Source Handover field in the probe.
    let handoverLinkLabel: string;
    let handoverLinkTarget: string;

    if (sourceIsLatest) {
      handoverLinkLabel = 'latest.md';
      handoverLinkTarget = '../handovers/latest.md';
    } else {
      if (sourceFilename === undefined) {
        vscode.window.showErrorMessage(
          'Witness: Create Resume Probe failed — source handover filename missing.'
        );
        return;
      }
      handoverLinkLabel = sourceFilename.replace(/\.md$/, '');
      handoverLinkTarget = `../handovers/${sourceFilename}`;
    }

    // 8. Compute the next probe ordinal by scanning .witness/evaluation/ for
    //    files matching `^resume-probe-<handoverId>-(\d{3})\.md$`.
    const evaluationDir = vscode.Uri.joinPath(witnessRoot, 'evaluation');
    await ensureDir(evaluationDir);

    const evalEntries = await safeReadDirectory(evaluationDir);
    const escapedHandoverId = escapeRegExp(handoverId);
    const probePattern = new RegExp(`^resume-probe-${escapedHandoverId}-(\\d{3})\\.md$`);

    let maxProbeOrdinal = 0;
    for (const [name] of evalEntries) {
      const m = probePattern.exec(name);
      if (m) {
        const ordinal = parseInt(m[1], 10);
        if (ordinal > maxProbeOrdinal) {
          maxProbeOrdinal = ordinal;
        }
      }
    }
    const probeNNN = String(maxProbeOrdinal + 1).padStart(3, '0');

    // 9. Build the probe ID and filename.
    const probeId = `resume-probe-${handoverId}-${probeNNN}`;
    const probeFilename = `${probeId}.md`;

    // 10. Load resume-probe-template.md and substitute placeholders.
    //
    //     Verified template placeholders (from src/templates/resume-probe-template.md):
    //
    //     {{PROBE_ID}}
    //       Appears TWICE: H1 title + under ## Probe ID section.
    //       SUBSTITUTED → the computed probeId (e.g. "resume-probe-handover-2026-05-12-001-001-001").
    //
    //     {{HANDOVER_ID}}
    //       Appears ONCE: under ## Source Handover.
    //       SUBSTITUTED → a markdown link: [handoverLinkLabel](handoverLinkTarget)
    //
    //     {{YYYY-MM-DDTHH:MM:SSZ}}
    //       Appears ONCE: under ## Probe Run At.
    //       SUBSTITUTED → new Date().toISOString()
    //
    //     {{CUSTOM_QUESTION_ABOUT_KEY_DECISION}}
    //       Appears ONCE: in Questions section, Q4 placeholder.
    //       LEAVE → kept as-is for user to replace with a project-specific question.
    //
    //     {{CUSTOM_QUESTION_ABOUT_ACTIVE_CONSTRAINT}}
    //       Appears ONCE: in Questions section, Q6 placeholder.
    //       LEAVE → kept as-is for user to replace with a project-specific question.
    //
    //     {{EXPECTED_ANSWER_1}} through {{EXPECTED_ANSWER_7}}
    //       Appear ONCE each: in Expected Answers section.
    //       LEAVE → for user to fill in before running the probe.
    //
    //     {{KEY_DECISION_SHORT}}
    //       Appears ONCE: in Expected Answers section, Q4 label.
    //       LEAVE → for user to fill in (matches their custom Q4).
    //
    //     {{ACTIVE_CONSTRAINT_SHORT}}
    //       Appears ONCE: in Expected Answers section, Q6 label.
    //       LEAVE → for user to fill in (matches their custom Q6).
    //
    //     {{YYYY-MM-DD}}
    //       Appears ONCE: in Result section, "Date probed" field.
    //       SUBSTITUTED → today's local date in YYYY-MM-DD format.
    //
    //     {{N}}
    //       Appears ONCE: in Result section, "Questions passed" field.
    //       LEAVE → for user to fill in after running the probe.
    //
    //     {{yes / no}}
    //       Appears ONCE: in Result section, "Mandatory questions passed" field.
    //       LEAVE → for user to fill in after running the probe.
    //
    //     {{PASS / FAIL}}
    //       Appears ONCE: in Result section, "Overall result" field.
    //       LEAVE → for user to fill in after running the probe.
    //
    //     {{NOTE_WHAT_FAILED_AND_WHY}}
    //       Appears ONCE: in Result section, "Notes on failures" field.
    //       LEAVE → for user to fill in after running the probe.
    //
    //     {{handover accepted / handover revised — see handover v2 / probe re-run}}
    //       Appears ONCE: in Result section, "Action taken" field.
    //       LEAVE → for user to fill in after running the probe.

    let content = await loadTemplate(context, 'resume-probe-template.md');

    // Compute timestamps (local timezone).
    const isoTimestamp = formatLocalTimestamp();
    const localDate = formatLocalDate();

    // Substitute {{PROBE_ID}} — appears twice (H1 title + ## Probe ID body).
    content = content.split('{{PROBE_ID}}').join(probeId);

    // Substitute {{HANDOVER_ID}} — appears once under ## Source Handover.
    // Replace with a markdown link to the source handover file.
    content = content.split('{{HANDOVER_ID}}').join(
      `[${handoverLinkLabel}](${handoverLinkTarget})`
    );

    // Substitute {{YYYY-MM-DDTHH:MM:SSZ}} — appears once under ## Probe Run At.
    content = content.split('{{YYYY-MM-DDTHH:MM:SSZ}}').join(isoTimestamp);

    // Substitute {{YYYY-MM-DD}} — appears once in Result section "Date probed".
    content = content.split('{{YYYY-MM-DD}}').join(localDate);

    // All remaining {{...}} placeholders are intentionally left for the user.
    // They include: {{CUSTOM_QUESTION_ABOUT_KEY_DECISION}},
    // {{CUSTOM_QUESTION_ABOUT_ACTIVE_CONSTRAINT}}, {{EXPECTED_ANSWER_1..7}},
    // {{KEY_DECISION_SHORT}}, {{ACTIVE_CONSTRAINT_SHORT}}, {{N}},
    // {{yes / no}}, {{PASS / FAIL}}, {{NOTE_WHAT_FAILED_AND_WHY}},
    // {{handover accepted / handover revised — see handover v2 / probe re-run}}.

    // Append generation metadata as a footer comment so the session ID is
    // recorded in the file without cluttering the visible content.
    content = content + `\n\n<!-- Generated by Witness: Create Resume Probe | session: ${probeSessionId} | ${isoTimestamp} -->`;

    // 11. Write the probe file (error if it somehow already exists).
    const probeUri = vscode.Uri.joinPath(evaluationDir, probeFilename);
    const written = await writeFileIfMissing(probeUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Create Resume Probe failed — File already exists: ${probeUri.fsPath}`
      );
      return;
    }

    // 12. Open the file in the editor.
    const doc = await vscode.workspace.openTextDocument(probeUri);
    await vscode.window.showTextDocument(doc);

    // 13. Info message.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.resume_probe.created',
      commandId: 'witness.createResumeProbe',
      sessionId: activeSessionId ?? null,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, probeUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        source_was_latest: sourceIsLatest,
        handover_id_source: handoverIdSource,
        probe_ordinal: maxProbeOrdinal + 1,
      },
    });
    vscode.window.showInformationMessage(`Witness: Resume probe ${probeId} created.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.resume_probe.created',
      commandId: 'witness.createResumeProbe',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(`Witness: Create Resume Probe failed — ${message}`);
  }
}
