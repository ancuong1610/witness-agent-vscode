// ---------------------------------------------------------------------------
// evaluationSummary.ts — Evaluation Summary generator (v3.6).
// ---------------------------------------------------------------------------
//
// Produces a deterministic, markdown-based evaluation summary for the active
// Witness session by reading `.witness/` artifacts and local telemetry.
//
// Design invariants:
//   - No LLM calls. No network calls. No raw artifact content in output.
//   - Uses vscode.workspace.fs exclusively (no node:fs).
//   - All I/O errors are caught and produce safe defaults.
//   - Does not inspect AI chat transcripts.
//   - Does not capture hidden reasoning.
//   - Telemetry is counted but attributes are not re-emitted.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { computeSubagentHealth } from './subagentHealth';
import { computeWorkspaceStatus } from './workspaceStatus';
import { formatLocalDate, formatLocalTimestamp } from './time';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The structured result of a single evaluation summary generation.
 * All counts are derived from filesystem artifact scans and local telemetry.
 */
export interface EvaluationSummaryResult {
  summaryUri: vscode.Uri;
  sessionId: string;
  computedAt: string;
  sessionDurationMinutes: number | null;
  telemetryEventCount: number;
  distinctCommandIds: string[];
  contextSnapshotCount: number;
  pressureLevels: string[];
  handoverCount: number;
  latestHandoverExists: boolean;
  validationReportCount: number;
  contextPacketCount: number;
  subagentTotalCount: number;
  subagentHealthyCount: number;
  subagentNeedsReviewCount: number;
  subagentIncompleteCount: number;
  subagentBlockedCount: number;
  subagentLoopRiskCount: number;
  subagentCompletionRate: string;
  riskAssessmentCount: number;
  latestRiskLevel: string | null;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Matches the "## Final Overall Level" section in risk files. */
const FINAL_RISK_LEVEL_RE =
  /##\s+Final Overall Level\s+\*\*(GREEN|YELLOW|ORANGE|RED|BLOCKED)\*\*/is;

/** Matches a pressure level label in context-pressure files. */
const PRESSURE_LEVEL_RE =
  /^\*{0,2}Pressure Level\*{0,2}:\s*(GREEN|YELLOW|ORANGE|RED|BLOCKED)/im;

// ---------------------------------------------------------------------------
// Internal filesystem helpers
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function safeReadDir(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return [];
  }
}

async function safeReadText(uri: vscode.Uri): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function safeStatExists(uri: vscode.Uri): Promise<vscode.FileStat | null> {
  try {
    return await vscode.workspace.fs.stat(uri);
  } catch {
    return null;
  }
}

/**
 * Counts files in `dir` whose names match `pattern`, returning both the count
 * and the content of the highest-ordinal matching file (by capture group 1).
 */
async function countAndPickLatest(
  dir: vscode.Uri,
  pattern: RegExp
): Promise<{ count: number; latestContent: string | null; latestUri: vscode.Uri | null }> {
  const entries = await safeReadDir(dir);
  let count = 0;
  let maxOrdinal = -1;
  let latestUri: vscode.Uri | null = null;

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File) {
      continue;
    }
    const match = pattern.exec(name);
    if (!match) {
      continue;
    }
    count++;
    const ordinal = parseInt(match[1], 10);
    if (ordinal > maxOrdinal) {
      maxOrdinal = ordinal;
      latestUri = vscode.Uri.joinPath(dir, name);
    }
  }

  const latestContent = latestUri ? await safeReadText(latestUri) : null;
  return { count, latestContent, latestUri };
}

// ---------------------------------------------------------------------------
// Output ordinal helper
// ---------------------------------------------------------------------------

/**
 * Returns the next ordinal (zero-padded to 3 digits) for evaluation summary
 * files matching `evaluation-summary-<sessionId>-NNN.md` in `evaluationDir`.
 */
async function nextSummaryOrdinal(
  evaluationDir: vscode.Uri,
  sessionId: string
): Promise<string> {
  const entries = await safeReadDir(evaluationDir);
  const escaped = escapeRegExp(sessionId);
  const pattern = new RegExp(`^evaluation-summary-${escaped}-(\\d{3})\\.md$`);
  let maxOrdinal = 0;

  for (const [name] of entries) {
    const match = pattern.exec(name);
    if (match) {
      const ordinal = parseInt(match[1], 10);
      if (ordinal > maxOrdinal) {
        maxOrdinal = ordinal;
      }
    }
  }

  return String(maxOrdinal + 1).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// Telemetry parsing
// ---------------------------------------------------------------------------

interface TelemetryData {
  eventCount: number;
  distinctCommandIds: string[];
}

async function parseTelemetry(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<TelemetryData> {
  const eventsUri = vscode.Uri.joinPath(
    witnessRoot, 'telemetry', 'otel', 'events.jsonl'
  );
  const text = await safeReadText(eventsUri);
  if (text === null) {
    return { eventCount: 0, distinctCommandIds: [] };
  }

  let eventCount = 0;
  const commandIdSet = new Set<string>();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      // Only count events that belong to this session.
      if (obj['session_id'] !== sessionId) {
        continue;
      }
      eventCount++;
      const commandId = obj['command_id'];
      if (typeof commandId === 'string' && commandId.length > 0) {
        commandIdSet.add(commandId);
      }
    } catch {
      // Malformed JSON line — skip silently.
    }
  }

  return { eventCount, distinctCommandIds: Array.from(commandIdSet).sort() };
}

// ---------------------------------------------------------------------------
// Context snapshots
// ---------------------------------------------------------------------------

interface SnapshotData {
  count: number;
  pressureLevels: string[];
}

async function scanContextSnapshots(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<SnapshotData> {
  const telemetryDir = vscode.Uri.joinPath(witnessRoot, 'telemetry', sessionId);
  const entries = await safeReadDir(telemetryDir);
  const pressurePattern = /^context-pressure-(\d{3})\.md$/;

  let count = 0;
  const levels: string[] = [];

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File) {
      continue;
    }
    if (!pressurePattern.test(name)) {
      continue;
    }
    count++;
    const fileUri = vscode.Uri.joinPath(telemetryDir, name);
    const text = await safeReadText(fileUri);
    if (text !== null) {
      const match = PRESSURE_LEVEL_RE.exec(text);
      if (match) {
        levels.push(match[1].toUpperCase());
      }
    }
  }

  return { count, pressureLevels: levels };
}

// ---------------------------------------------------------------------------
// Handovers
// ---------------------------------------------------------------------------

interface HandoverData {
  count: number;
  latestHandoverExists: boolean;
}

async function scanHandovers(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<HandoverData> {
  const handoversDir = vscode.Uri.joinPath(witnessRoot, 'handovers');
  const escaped = escapeRegExp(sessionId);
  const { count } = await countAndPickLatest(
    handoversDir,
    new RegExp(`^handover-${escaped}-(\\d{3})\\.md$`)
  );

  const latestStat = await safeStatExists(
    vscode.Uri.joinPath(handoversDir, 'latest.md')
  );

  return { count, latestHandoverExists: latestStat !== null };
}

// ---------------------------------------------------------------------------
// Validation reports
// ---------------------------------------------------------------------------

async function scanValidationReports(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<number> {
  const evalDir = vscode.Uri.joinPath(witnessRoot, 'evaluation');
  const entries = await safeReadDir(evalDir);
  const escaped = escapeRegExp(sessionId);
  // Matches: handover-<sessionId>-NNN-validation-MMM.md
  // or any validation report filename containing the sessionId.
  const pattern = new RegExp(`handover-${escaped}.*validation.*\\.md$`);
  let count = 0;

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File) {
      continue;
    }
    if (pattern.test(name)) {
      count++;
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Context packets
// ---------------------------------------------------------------------------

async function scanContextPackets(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<number> {
  const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
  const escaped = escapeRegExp(sessionId);
  const { count } = await countAndPickLatest(
    sessionsDir,
    new RegExp(`^${escaped}-context-packet-(\\d+)\\.md$`)
  );
  return count;
}

// ---------------------------------------------------------------------------
// Risk assessments
// ---------------------------------------------------------------------------

interface RiskData {
  count: number;
  latestRiskLevel: string | null;
}

async function scanRiskAssessments(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<RiskData> {
  const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
  const escaped = escapeRegExp(sessionId);
  const { count, latestContent } = await countAndPickLatest(
    sessionsDir,
    new RegExp(`^${escaped}-risk-(\\d{3})\\.md$`)
  );

  let latestRiskLevel: string | null = null;
  if (latestContent !== null) {
    const match = FINAL_RISK_LEVEL_RE.exec(latestContent);
    if (match) {
      latestRiskLevel = match[1].toUpperCase();
    }
  }

  return { count, latestRiskLevel };
}

// ---------------------------------------------------------------------------
// Session duration
// ---------------------------------------------------------------------------

async function computeSessionDuration(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<number | null> {
  const sessionFileUri = vscode.Uri.joinPath(witnessRoot, 'sessions', `${sessionId}.md`);
  const st = await safeStatExists(sessionFileUri);
  if (st === null) {
    return null;
  }
  // Use the file mtime as a proxy for the last edit time.
  // The session file is written once at session start so its mtime is a
  // reasonable upper bound on session age.
  const ageMs = Date.now() - st.mtime;
  return ageMs > 0 ? Math.floor(ageMs / 60_000) : 0;
}

// ---------------------------------------------------------------------------
// Subagent completion rate
// ---------------------------------------------------------------------------

function formatCompletionRate(healthy: number, total: number): string {
  if (total === 0) {
    return 'n/a (no subagent records)';
  }
  const pct = Math.round((healthy / total) * 100);
  return `${healthy}/${total} (${pct}%)`;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderSummaryMarkdown(r: EvaluationSummaryResult): string {
  const lines: string[] = [];

  lines.push('# Witness Evaluation Summary');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **Session ID**: ${r.sessionId}`);
  lines.push(`- **Computed At**: ${r.computedAt}`);
  const durationLabel =
    r.sessionDurationMinutes !== null
      ? `${r.sessionDurationMinutes} minutes (elapsed since session file mtime)`
      : 'Unknown';
  lines.push(`- **Session Duration**: ${durationLabel}`);
  lines.push('- **Source**: `.witness/` artifacts and local telemetry');

  // Emit a clarifying note when the date embedded in the session ID differs from
  // today's local date. Session IDs use the date the session was started; the summary
  // is computed at the current local time. The two can differ when a session spans
  // midnight or when reviewing an older session the next day.
  //
  // Session IDs follow the format YYYY-MM-DD-NNN (first 10 chars are the date).
  // We compare only if the session ID actually begins with a plausible date string.
  const todayDate = formatLocalDate();
  const sessionIdDatePart = r.sessionId.slice(0, 10);
  const looksLikeDate = /^\d{4}-\d{2}-\d{2}$/.test(sessionIdDatePart);
  if (looksLikeDate && sessionIdDatePart !== todayDate) {
    lines.push('');
    lines.push(
      `> **Note**: This summary was generated on ${todayDate}, but the active session ID ` +
      `is dated ${sessionIdDatePart} because the session was started on that date.`
    );
  }

  lines.push('');

  // 1. Command Activity
  lines.push('---');
  lines.push('');
  lines.push('## 1. Command Activity');
  lines.push('');
  lines.push(
    `- **Telemetry events (this session)**: ${r.telemetryEventCount}`
  );
  if (r.distinctCommandIds.length > 0) {
    lines.push(`- **Distinct command IDs used**: ${r.distinctCommandIds.join(', ')}`);
  } else {
    lines.push('- **Distinct command IDs used**: none recorded');
  }
  lines.push('');
  lines.push(
    '> Telemetry is stored in `.witness/telemetry/otel/events.jsonl` as local JSONL ' +
    'and is not part of the default agent context read set.'
  );
  lines.push('');

  // 2. Context Snapshots
  lines.push('---');
  lines.push('');
  lines.push('## 2. Context Snapshots');
  lines.push('');
  lines.push(`- **Count**: ${r.contextSnapshotCount}`);
  if (r.pressureLevels.length > 0) {
    lines.push(`- **Pressure levels recorded**: ${r.pressureLevels.join(', ')}`);
  } else if (r.contextSnapshotCount > 0) {
    lines.push('- **Pressure levels**: not extracted');
  } else {
    lines.push('- **Pressure levels**: none (no snapshots found)');
  }
  lines.push('');

  // 3. Handovers
  lines.push('---');
  lines.push('');
  lines.push('## 3. Handovers');
  lines.push('');
  lines.push(`- **Handover documents for this session**: ${r.handoverCount}`);
  lines.push(
    `- **Latest handover exists** (\`.witness/handovers/latest.md\`): ${r.latestHandoverExists ? 'yes' : 'no'}`
  );
  lines.push('');

  // 4. Validation Results
  lines.push('---');
  lines.push('');
  lines.push('## 4. Validation Results');
  lines.push('');
  lines.push(`- **Validation reports for this session**: ${r.validationReportCount}`);
  lines.push('');
  lines.push(
    '> Pass/fail interpretation was not inferred. ' +
    'Open the validation report files directly for detailed results.'
  );
  lines.push('');

  // 5. Context Packets
  lines.push('---');
  lines.push('');
  lines.push('## 5. Context Packets');
  lines.push('');
  lines.push(`- **Context packets for this session**: ${r.contextPacketCount}`);
  lines.push('');

  // 6. Subagent Ledger Health
  lines.push('---');
  lines.push('');
  lines.push('## 6. Subagent Ledger Health');
  lines.push('');
  lines.push(`- **Total entries**: ${r.subagentTotalCount}`);
  lines.push(`- **Healthy**: ${r.subagentHealthyCount}`);
  lines.push(`- **Needs review**: ${r.subagentNeedsReviewCount}`);
  lines.push(`- **Incomplete**: ${r.subagentIncompleteCount}`);
  lines.push(`- **Blocked or failed**: ${r.subagentBlockedCount}`);
  lines.push(`- **Loop risk**: ${r.subagentLoopRiskCount}`);
  lines.push(`- **Completion rate**: ${r.subagentCompletionRate}`);
  lines.push('');

  // 7. Risk Assessments
  lines.push('---');
  lines.push('');
  lines.push('## 7. Risk Assessments');
  lines.push('');
  lines.push(`- **Risk assessments for this session**: ${r.riskAssessmentCount}`);
  lines.push(
    `- **Latest risk level**: ${r.latestRiskLevel !== null ? r.latestRiskLevel : 'none'}`
  );
  lines.push('');

  // 8. Observable Context Degradation Signals
  lines.push('---');
  lines.push('');
  lines.push('## 8. Observable Context Degradation Signals');
  lines.push('');
  lines.push(
    '> These signals are computed from `.witness/` artifact ages and health counts. ' +
    'They indicate the observable state of continuity artifacts, not AI reasoning quality.'
  );
  lines.push('');

  // These are populated by the caller from computeWorkspaceStatus.
  // The fields are embedded by passing the degradationLines array.
  // (See renderDegradationLines helper below.)
  lines.push('{{DEGRADATION_LINES}}');
  lines.push('');

  // 9. Research Notes
  lines.push('---');
  lines.push('');
  lines.push('## 9. Research Notes');
  lines.push('');
  lines.push(
    '- This summary is generated from persisted Witness artifacts stored in `.witness/`.'
  );
  lines.push('- It does not inspect AI chat transcripts.');
  lines.push('- It does not capture hidden reasoning or model chain-of-thought.');
  lines.push(
    '- It should be used as evaluation evidence alongside manual review, ' +
    'not as a standalone quality judgment.'
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function buildDegradationLines(
  status: {
    currentStateAgeMinutes: number | null;
    latestHandoverAgeMinutes: number | null;
    latestContextPacketExists: boolean;
    pendingSubagentReviews: number;
    blockedOrFailedSubagents: number;
    suggestedAction: { label: string; reason: string; severity: string };
  }
): string[] {
  const lines: string[] = [];

  const fmtAge = (min: number | null): string => {
    if (min === null) {
      return 'n/a';
    }
    if (min < 60) {
      return `${min} min`;
    }
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  lines.push(
    `- **Current state age**: ${fmtAge(status.currentStateAgeMinutes)}`
  );
  lines.push(
    `- **Latest handover age**: ${fmtAge(status.latestHandoverAgeMinutes)}`
  );
  lines.push(
    `- **Context packet exists**: ${status.latestContextPacketExists ? 'yes' : 'no'}`
  );
  lines.push(
    `- **Pending subagent reviews**: ${status.pendingSubagentReviews}`
  );
  lines.push(
    `- **Blocked or failed subagents**: ${status.blockedOrFailedSubagents}`
  );
  lines.push(
    `- **Latest suggested action**: ${status.suggestedAction.label} — ${status.suggestedAction.reason}`
  );

  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the evaluation summary for `sessionId` in the given workspace,
 * writes it to `.witness/evaluation/evaluation-summary-<sessionId>-NNN.md`,
 * and returns the structured result.
 *
 * Never throws. All I/O failures produce safe defaults.
 */
export async function generateEvaluationSummary(
  workspaceRoot: vscode.Uri,
  sessionId: string
): Promise<EvaluationSummaryResult> {
  const witnessRoot = vscode.Uri.joinPath(workspaceRoot, '.witness');
  const computedAt = formatLocalTimestamp();

  // -------------------------------------------------------------------------
  // Gather all data in parallel where independent.
  // -------------------------------------------------------------------------

  const [
    telemetry,
    snapshots,
    handovers,
    validationCount,
    contextPacketCount,
    riskData,
    subagentHealth,
    sessionDurationMinutes,
    wsStatus,
  ] = await Promise.all([
    parseTelemetry(witnessRoot, sessionId),
    scanContextSnapshots(witnessRoot, sessionId),
    scanHandovers(witnessRoot, sessionId),
    scanValidationReports(witnessRoot, sessionId),
    scanContextPackets(witnessRoot, sessionId),
    scanRiskAssessments(witnessRoot, sessionId),
    computeSubagentHealth(workspaceRoot),
    computeSessionDuration(witnessRoot, sessionId),
    computeWorkspaceStatus(workspaceRoot),
  ]);

  // -------------------------------------------------------------------------
  // Assemble result record.
  // -------------------------------------------------------------------------

  const subagentCompletionRate = formatCompletionRate(
    subagentHealth.healthyCount,
    subagentHealth.totalCount
  );

  // -------------------------------------------------------------------------
  // Determine output URI.
  // -------------------------------------------------------------------------

  const evalDir = vscode.Uri.joinPath(witnessRoot, 'evaluation');
  try {
    await vscode.workspace.fs.createDirectory(evalDir);
  } catch {
    // Directory already exists or cannot be created — proceed anyway.
  }

  const nnn = await nextSummaryOrdinal(evalDir, sessionId);
  const summaryFilename = `evaluation-summary-${sessionId}-${nnn}.md`;
  const summaryUri = vscode.Uri.joinPath(evalDir, summaryFilename);

  // -------------------------------------------------------------------------
  // Build result object (needed for both markdown and telemetry).
  // -------------------------------------------------------------------------

  const result: EvaluationSummaryResult = {
    summaryUri,
    sessionId,
    computedAt,
    sessionDurationMinutes,
    telemetryEventCount: telemetry.eventCount,
    distinctCommandIds: telemetry.distinctCommandIds,
    contextSnapshotCount: snapshots.count,
    pressureLevels: snapshots.pressureLevels,
    handoverCount: handovers.count,
    latestHandoverExists: handovers.latestHandoverExists,
    validationReportCount: validationCount,
    contextPacketCount,
    subagentTotalCount: subagentHealth.totalCount,
    subagentHealthyCount: subagentHealth.healthyCount,
    subagentNeedsReviewCount: subagentHealth.needsReviewCount,
    subagentIncompleteCount: subagentHealth.incompleteCount,
    subagentBlockedCount: subagentHealth.blockedCount,
    subagentLoopRiskCount: subagentHealth.loopRiskCount,
    subagentCompletionRate,
    riskAssessmentCount: riskData.count,
    latestRiskLevel: riskData.latestRiskLevel,
  };

  // -------------------------------------------------------------------------
  // Render markdown and splice in degradation lines.
  // -------------------------------------------------------------------------

  const degradationLines = buildDegradationLines({
    currentStateAgeMinutes: wsStatus.currentStateAgeMinutes,
    latestHandoverAgeMinutes: wsStatus.latestHandoverAgeMinutes,
    latestContextPacketExists: wsStatus.latestContextPacketExists,
    pendingSubagentReviews: wsStatus.pendingSubagentReviews,
    blockedOrFailedSubagents: wsStatus.blockedOrFailedSubagents,
    suggestedAction: wsStatus.suggestedAction,
  });

  const markdown = renderSummaryMarkdown(result).replace(
    '{{DEGRADATION_LINES}}',
    degradationLines.join('\n')
  );

  // -------------------------------------------------------------------------
  // Write to disk.
  // -------------------------------------------------------------------------

  try {
    await vscode.workspace.fs.writeFile(
      summaryUri,
      new TextEncoder().encode(markdown)
    );
  } catch {
    // Write failure is surfaced to the caller via the returned URI; the command
    // will fail to open the file and can show its own error message.
  }

  return result;
}
