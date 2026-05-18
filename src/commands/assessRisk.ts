import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { ensureDir, writeFileIfMissing } from '../core/artifactWriter';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  RISK_DIMENSIONS,
  RISK_LEVELS,
  RISK_LEVEL_DESCRIPTIONS,
  RiskLevel,
  DimensionLevels,
  computeOverall,
} from '../core/riskEngine';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalTimestamp } from '../core/time';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a string for safe use inside a `RegExp` constructor.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the five QuickPickItems for a risk level selection prompt.
 * The `suggestedLevel` parameter, when provided, causes that level's
 * description to be prefixed with `(suggested) `.
 */
function buildLevelItems(suggestedLevel?: RiskLevel): vscode.QuickPickItem[] {
  return RISK_LEVELS.map(level => ({
    label: level,
    description:
      level === suggestedLevel
        ? `(suggested) ${RISK_LEVEL_DESCRIPTIONS[level]}`
        : RISK_LEVEL_DESCRIPTIONS[level],
  }));
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Assess Continuity Risk` command.
 *
 * Guides the user through five sequential QuickPick prompts — one per locked
 * risk dimension — then auto-computes the suggested overall level via the
 * worst-wins rule and lets the user confirm or override it in a sixth
 * QuickPick. Writes `<session-id>-risk-NNN.md` to `.witness/sessions/`.
 * Requires an active session.
 */
export async function assessRisk(context: vscode.ExtensionContext): Promise<void> {
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

    // 3. Require an active session.
    const sessionId = await getCurrentSessionId(witnessRoot);
    if (sessionId === undefined) {
      vscode.window.showErrorMessage(
        'Witness: No active session. Run "Witness: Start Session" first.'
      );
      return;
    }

    // 4. Prompt for each of the five locked dimensions in canonical order.
    //    If the user cancels at any dimension, abort without writing a file.
    const levelItems = buildLevelItems();
    const dimensionResults: Partial<DimensionLevels> = {};

    for (const dimension of RISK_DIMENSIONS) {
      const picked = await vscode.window.showQuickPick(levelItems, {
        title: `Risk: ${dimension.label}`,
        placeHolder: 'Select level for this dimension',
        ignoreFocusOut: true,
      });

      if (picked === undefined) {
        vscode.window.showInformationMessage('Witness: Assess Continuity Risk cancelled.');
        await emitWitnessEvent({
          workspaceRoot,
          eventName: 'witness.risk.assessed',
          commandId: 'witness.assessRisk',
          sessionId,
          status: 'cancelled',
          durationMs: elapsed(),
        });
        return;
      }

      dimensionResults[dimension.key] = picked.label as RiskLevel;
    }

    // All five dimensions have been selected at this point.
    const dims = dimensionResults as DimensionLevels;

    // 5. Compute the suggested overall level via worst-wins rule.
    const suggested = computeOverall(dims);

    // 6. Sixth QuickPick — confirm or override the suggestion.
    //    NOTE: `activeItems` is a property of `QuickPick` (createQuickPick) but
    //    NOT of `QuickPickOptions` (showQuickPick). To actually pre-select the
    //    suggested level so the user can confirm with Enter, we use the
    //    lower-level `createQuickPick` API and drive it via a Promise.
    const overallItems = buildLevelItems(suggested);
    const suggestedItem = overallItems.find(item => item.label === suggested);

    const finalPicked = await new Promise<vscode.QuickPickItem | undefined>(resolve => {
      const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
      qp.items = overallItems;
      qp.title = `Overall Risk Level — suggested: ${suggested}`;
      qp.placeholder = 'Confirm or override the suggestion';
      qp.ignoreFocusOut = true;
      if (suggestedItem) {
        qp.activeItems = [suggestedItem];
      }

      let accepted = false;

      qp.onDidAccept(() => {
        accepted = true;
        // Prefer selectedItems (user pressed Enter on an item); fall back to
        // activeItems (the currently highlighted item) for safety.
        const picked = qp.selectedItems[0] ?? qp.activeItems[0];
        resolve(picked);
        qp.hide();
      });

      qp.onDidHide(() => {
        if (!accepted) {
          resolve(undefined);
        }
        qp.dispose();
      });

      qp.show();
    });

    if (finalPicked === undefined) {
      vscode.window.showInformationMessage('Witness: Assess Continuity Risk cancelled.');
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.risk.assessed',
        commandId: 'witness.assessRisk',
        sessionId,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          active_context_pressure: dims.activeContextPressure,
          artifact_externalization_gap: dims.artifactExternalizationGap,
          subagent_boundary_risk: dims.subagentBoundaryRisk,
          quality_drift: dims.qualityDrift,
          phase_boundary_risk: dims.phaseBoundaryRisk,
          suggested_level: suggested,
        },
      });
      return;
    }

    const finalLevel = finalPicked.label as RiskLevel;

    // 7. Compute next risk-assessment ordinal by scanning .witness/sessions/ for
    //    files matching ^<session-id>-risk-(\d{3})\.md$.
    const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
    await ensureDir(sessionsDir);

    const riskPattern = new RegExp(
      `^${escapeRegExp(sessionId)}-risk-(\\d{3})\\.md$`
    );
    let maxOrdinal = 0;

    try {
      const entries = await vscode.workspace.fs.readDirectory(sessionsDir);
      for (const [name] of entries) {
        const match = riskPattern.exec(name);
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
    const riskId = `${sessionId}-risk-${nnn}`;
    const riskFilename = `${riskId}.md`;

    // 8. Compose the risk-assessment markdown.
    //    Dimension labels come from RISK_DIMENSIONS so future renames propagate automatically.
    const [acp, aeg, sbr, qd, pbr] = RISK_DIMENSIONS;
    const assessedAt = formatLocalTimestamp();

    const content = [
      `# Risk Assessment: ${riskId}`,
      '',
      `**Session**: ${sessionId}`,
      `**Assessed At**: ${assessedAt}`,
      '',
      '---',
      '',
      '## Risk Dimensions',
      '',
      '| Dimension | Level | Rationale |',
      '|-----------|-------|-----------|',
      `| ${acp.label} | ${dims.activeContextPressure} | {{rationale_acp}} |`,
      `| ${aeg.label} | ${dims.artifactExternalizationGap} | {{rationale_aeg}} |`,
      `| ${sbr.label} | ${dims.subagentBoundaryRisk} | {{rationale_sbr}} |`,
      `| ${qd.label} | ${dims.qualityDrift} | {{rationale_qd}} |`,
      `| ${pbr.label} | ${dims.phaseBoundaryRisk} | {{rationale_pbr}} |`,
      '',
      '---',
      '',
      '## Suggested Overall Level',
      '',
      `**${suggested}**`,
      '',
      'Computed via worst-wins rule from the five per-dimension levels above.',
      '',
      '---',
      '',
      '## Final Overall Level',
      '',
      `**${finalLevel}**`,
      '',
      '<!-- If finalLevel differs from suggestedLevel, briefly explain why in the Notes section. -->',
      '',
      '---',
      '',
      '## Notes',
      '',
      '{{NOTES}}',
    ].join('\n');

    // 9. Write the file to .witness/sessions/<session-id>-risk-NNN.md.
    const riskUri = vscode.Uri.joinPath(sessionsDir, riskFilename);
    const written = await writeFileIfMissing(riskUri, content);
    if (!written) {
      vscode.window.showErrorMessage(
        `Witness: Assess Continuity Risk failed — File already exists: ${riskUri.fsPath}`
      );
      return;
    }

    // 10. Open it in the editor.
    const doc = await vscode.workspace.openTextDocument(riskUri);
    await vscode.window.showTextDocument(doc);

    // 11. Confirm success.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.risk.assessed',
      commandId: 'witness.assessRisk',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, riskUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        active_context_pressure: dims.activeContextPressure,
        artifact_externalization_gap: dims.artifactExternalizationGap,
        subagent_boundary_risk: dims.subagentBoundaryRisk,
        quality_drift: dims.qualityDrift,
        phase_boundary_risk: dims.phaseBoundaryRisk,
        suggested_level: suggested,
        final_level: finalLevel,
        developer_override: finalLevel !== suggested,
        risk_ordinal: nextOrdinal,
      },
    });
    vscode.window.showInformationMessage(
      `Witness: Risk assessment ${nnn} recorded — overall ${finalLevel}.`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.risk.assessed',
      commandId: 'witness.assessRisk',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Assess Continuity Risk failed — ${message}`
    );
  }
}
