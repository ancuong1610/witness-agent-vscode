// ---------------------------------------------------------------------------
// showWorkspaceStatus.ts — Witness: Show Workspace Status command (v3.2).
// ---------------------------------------------------------------------------
//
// Computes the current Witness workspace status, formats it as a structured
// markdown document, and opens it in a new unsaved editor tab.
//
// Design invariants:
//   - No automatic actions. No artifact writes. Read-only.
//   - Status is computed fresh on every invocation (no caching in v3.1/v3.2).
//   - No LLM calls. Deterministic output from filesystem state only.
//   - Telemetry event emitted after the document opens. No artifact paths
//     in the event (no file is written by this command).
//   - No raw artifact content is included in telemetry attributes.
//   - v3.2: adds Subagent Health Details section with per-entry markdown table.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot } from '../core/witnessPaths';
import { computeWorkspaceStatus, WitnessWorkspaceStatus } from '../core/workspaceStatus';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';
import { formatLocalTimestamp } from '../core/time';

// ---------------------------------------------------------------------------
// Markdown formatting
// ---------------------------------------------------------------------------

/**
 * Formats a `WitnessWorkspaceStatus` record as a human-readable markdown
 * string suitable for display in an unsaved VS Code editor tab.
 */
function formatStatusMarkdown(status: WitnessWorkspaceStatus): string {
  const now = formatLocalTimestamp();

  // -------------------------------------------------------------------------
  // Helper: format an age value for display.
  // -------------------------------------------------------------------------
  function fmtAge(ageMinutes: number | null): string {
    if (ageMinutes === null) {
      return 'n/a';
    }
    if (ageMinutes < 1) {
      return 'less than 1 minute ago';
    }
    if (ageMinutes === 1) {
      return '1 minute ago';
    }
    if (ageMinutes < 60) {
      return `${ageMinutes} minutes ago`;
    }
    const hours = Math.floor(ageMinutes / 60);
    const mins = ageMinutes % 60;
    if (hours === 1) {
      return mins > 0 ? `1 hour ${mins} min ago` : '1 hour ago';
    }
    return mins > 0 ? `${hours} hours ${mins} min ago` : `${hours} hours ago`;
  }

  // -------------------------------------------------------------------------
  // Helper: format exists + age as a single string.
  // -------------------------------------------------------------------------
  function fmtArtifact(exists: boolean, ageMinutes: number | null): string {
    if (!exists) {
      return 'missing';
    }
    return `present (modified ${fmtAge(ageMinutes)})`;
  }

  // -------------------------------------------------------------------------
  // Helper: severity prefix for the suggested action section.
  // -------------------------------------------------------------------------
  function fmtSeverity(severity: 'info' | 'warning' | 'critical'): string {
    if (severity === 'critical') {
      return '[CRITICAL]';
    }
    if (severity === 'warning') {
      return '[WARNING]';
    }
    return '[INFO]';
  }

  // -------------------------------------------------------------------------
  // Build markdown sections.
  // -------------------------------------------------------------------------

  const lines: string[] = [];

  lines.push('# Witness Workspace Status');
  lines.push('');
  lines.push(`**Computed at**: ${now}`);
  lines.push(`**Active session**: ${status.activeSessionId ?? 'none'}`);
  lines.push('');

  // Continuity artifacts.
  lines.push('---');
  lines.push('');
  lines.push('## Continuity Artifacts');
  lines.push('');
  lines.push(
    `- **Current state**: ${fmtArtifact(status.currentStateExists, status.currentStateAgeMinutes)}`
  );
  lines.push(
    `- **Latest handover**: ${fmtArtifact(status.latestHandoverExists, status.latestHandoverAgeMinutes)}`
  );
  lines.push(
    `- **Latest context packet**: ${fmtArtifact(status.latestContextPacketExists, status.latestContextPacketAgeMinutes)}`
  );

  const markersDisplay =
    status.latestContextPacketHasMandatoryMarkers === true
      ? 'present'
      : status.latestContextPacketHasMandatoryMarkers === false
        ? 'none'
        : 'unknown';
  lines.push(`- **Context packet markers**: ${markersDisplay}`);

  const riskDisplay = status.latestRiskLevel
    ? `${status.latestRiskLevel} (${fmtAge(status.latestRiskAgeMinutes)})`
    : 'none';
  lines.push(`- **Latest risk assessment**: ${riskDisplay}`);
  lines.push('');

  // Subagent health aggregate counts.
  lines.push('---');
  lines.push('');
  lines.push('## Subagent Health');
  lines.push('');
  lines.push(`- **Pending reviews**: ${status.pendingSubagentReviews}`);
  lines.push(`- **Incomplete ledgers**: ${status.incompleteSubagentLedgers}`);
  lines.push(`- **Blocked or failed**: ${status.blockedOrFailedSubagents}`);
  lines.push('');

  // Subagent health per-entry details table.
  lines.push('---');
  lines.push('');
  lines.push('## Subagent Health Details');
  lines.push('');

  const healthEntries = status.subagentHealthSummary.entries;
  if (healthEntries.length === 0) {
    lines.push('No subagent records found.');
  } else {
    lines.push('| ID | Format | Health | Age | Missing Stages | Path |');
    lines.push('|----|--------|--------|-----|----------------|------|');
    for (const entry of healthEntries) {
      const ageCell = fmtAge(entry.ageMinutes);
      const missingCell =
        entry.stagesMissing.length > 0 ? entry.stagesMissing.join(', ') : '-';
      lines.push(
        `| ${entry.id} | ${entry.format} | ${entry.healthLevel} | ${ageCell} | ${missingCell} | ${entry.path} |`
      );
    }
  }
  lines.push('');

  // Telemetry.
  lines.push('---');
  lines.push('');
  lines.push('## Telemetry');
  lines.push('');
  lines.push(
    `- **Events file**: ${status.telemetryEventsExists ? 'present' : 'missing'}`
  );
  lines.push(`- **Events recorded**: ${status.telemetryEventCount}`);
  lines.push('');

  // Suggested action.
  const action = status.suggestedAction;
  lines.push('---');
  lines.push('');
  lines.push('## Suggested Action');
  lines.push('');
  lines.push(
    `${fmtSeverity(action.severity)} **${action.label}**`
  );
  lines.push('');
  lines.push(`Reason: ${action.reason}`);
  if (action.commandId) {
    lines.push('');
    lines.push(`Command: \`${action.commandId}\``);
  }
  lines.push('');

  // Footer note.
  lines.push('---');
  lines.push('');
  lines.push(
    '> This status is computed from `.witness/` artifacts only. ' +
    'It does not inspect chat transcripts or hidden model reasoning.'
  );
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Show Workspace Status` command.
 *
 * Computes the workspace continuity status, formats it as markdown, and opens
 * it in a new unsaved editor tab. Emits a telemetry event on completion.
 *
 * No files are written to disk by this command.
 */
export async function showWorkspaceStatus(
  context: vscode.ExtensionContext
): Promise<void> {
  void context;
  const elapsed = createCommandTimer();

  // Capture workspaceRoot early for telemetry even if guards fail later.
  const workspaceRoot = getWorkspaceRoot();

  try {
    // 1. Require an open workspace folder.
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      await emitWitnessEvent({
        workspaceRoot: undefined,
        eventName: 'witness.workspace_status.shown',
        commandId: 'witness.showWorkspaceStatus',
        status: 'error',
        durationMs: elapsed(),
        attributes: { error: 'no_workspace' },
      });
      return;
    }

    // 2. If .witness/ does not exist, still compute (the status will reflect
    //    its absence and the suggested action will point to initProject).
    //    No guard failure here — the scanner handles this gracefully.

    // 3. Compute workspace status.
    const status = await computeWorkspaceStatus(workspaceRoot);

    // 4. Format the markdown summary.
    const markdown = formatStatusMarkdown(status);

    // 5. Open as an unsaved markdown document in a new editor tab.
    const doc = await vscode.workspace.openTextDocument({
      content: markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: false });

    // 6. Emit telemetry.
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workspace_status.shown',
      commandId: 'witness.showWorkspaceStatus',
      sessionId: status.activeSessionId,
      artifactPaths: [],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        has_witness: status.hasWitness,
        active_session_present: status.activeSessionId !== null,
        current_state_exists: status.currentStateExists,
        current_state_age_minutes: status.currentStateAgeMinutes,
        latest_handover_exists: status.latestHandoverExists,
        latest_context_packet_exists: status.latestContextPacketExists,
        latest_context_packet_has_mandatory_markers: status.latestContextPacketHasMandatoryMarkers,
        latest_risk_level: status.latestRiskLevel,
        pending_subagent_reviews: status.pendingSubagentReviews,
        incomplete_subagent_ledgers: status.incompleteSubagentLedgers,
        blocked_or_failed_subagents: status.blockedOrFailedSubagents,
        telemetry_event_count: status.telemetryEventCount,
        suggested_action_id: status.suggestedAction.id,
        suggested_action_severity: status.suggestedAction.severity,
        subagent_total_count: status.subagentHealthSummary.totalCount,
        subagent_healthy_count: status.subagentHealthSummary.healthyCount,
        subagent_needs_review_count: status.subagentHealthSummary.needsReviewCount,
        subagent_incomplete_count: status.subagentHealthSummary.incompleteCount,
        subagent_blocked_count: status.subagentHealthSummary.blockedCount,
        subagent_loop_risk_count: status.subagentHealthSummary.loopRiskCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workspace_status.shown',
      commandId: 'witness.showWorkspaceStatus',
      status: 'error',
      durationMs: elapsed(),
      attributes: { error: 'unexpected' },
    });
    vscode.window.showErrorMessage(
      `Witness: Show Workspace Status failed — ${message}`
    );
  }
}
