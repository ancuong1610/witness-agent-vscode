import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, writeFileIfMissing } from '../core/artifactWriter';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  gatherArtifactRefs,
  generateHandoverContent,
  nextHandoverOrdinal,
} from '../core/handoverGenerator';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';

// ---------------------------------------------------------------------------
// generateHandover.ts — command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Generate Handover` command.
 *
 * Gathers artifact references for the active session, renders the handover
 * document from `handover-template.md`, writes it to
 * `.witness/handovers/handover-<session-id>-NNN.md`, and also overwrites
 * `.witness/handovers/latest.md` with the same content so that a fresh
 * Copilot session can always read the most recent handover without indirection.
 *
 * Missing source artifacts produce explicit gap markers in the rendered
 * content rather than failing the command. The validator catches gaps.
 *
 * Requires an active session.
 */
export async function generateHandover(context: vscode.ExtensionContext): Promise<void> {
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

    // 3. Require an active session.
    const sessionId = await getCurrentSessionId(witnessRoot);
    if (sessionId === undefined) {
      vscode.window.showErrorMessage(
        'Witness: No active session. Run "Witness: Start Session" first.'
      );
      return;
    }

    // 4. Ensure the handovers/ directory exists.
    const handoversDir = vscode.Uri.joinPath(witnessRoot, 'handovers');
    await ensureDir(handoversDir);

    // 5. Gather artifact refs and compute the next ordinal in parallel.
    const [refs, nnn] = await Promise.all([
      gatherArtifactRefs(witnessRoot, sessionId),
      nextHandoverOrdinal(witnessRoot, sessionId),
    ]);

    // 6. Render the handover markdown.
    const content = await generateHandoverContent(
      { witnessRoot, workspaceRoot, sessionId, context },
      refs,
      nnn
    );

    const handoverId = `handover-${sessionId}-${nnn}`;
    const handoverFilename = `${handoverId}.md`;

    // 7. Write to .witness/handovers/handover-<session-id>-NNN.md.
    //    Use writeFileIfMissing — existence is a bug (ordinal collision).
    const handoverUri = vscode.Uri.joinPath(handoversDir, handoverFilename);
    const written = await writeFileIfMissing(handoverUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Generate Handover failed — File already exists: ${handoverUri.fsPath}`
      );
      return;
    }

    // 8. Overwrite .witness/handovers/latest.md with the same content.
    //    Intentional overwrite — use writeFile directly.
    const latestUri = vscode.Uri.joinPath(handoversDir, 'latest.md');
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(latestUri, encoder.encode(content));

    // 9. Open the dated handover file in the editor.
    const doc = await vscode.workspace.openTextDocument(handoverUri);
    await vscode.window.showTextDocument(doc);

    // 10. Count gap markers for the info message.
    //     Count occurrences of "(MANDATORY:" and "(no " as gap indicators.
    const mandatoryCount = (content.match(/\(MANDATORY:/g) ?? []).length;
    const noDataCount = (content.match(/\(no /g) ?? []).length;
    const gapsCount = mandatoryCount + noDataCount;

    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.handover.generated',
      commandId: 'witness.generateHandover',
      sessionId,
      artifactPaths: [
        toRelativeWitnessPath(workspaceRoot, handoverUri),
        toRelativeWitnessPath(workspaceRoot, latestUri),
      ],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        had_risk_assessment: refs.latestRiskFile !== undefined,
        had_workspace_observation: refs.latestObservationFile !== undefined,
        adr_count: refs.adrFiles.length,
        subagent_report_count: refs.subagentFiles.length,
        gaps_count: gapsCount,
        handover_ordinal: parseInt(nnn, 10),
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Handover ${handoverId} generated. ${gapsCount} field(s) need manual fill-in.`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.handover.generated',
      commandId: 'witness.generateHandover',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(`Witness: Generate Handover failed — ${message}`);
  }
}
