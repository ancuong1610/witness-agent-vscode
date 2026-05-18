// ---------------------------------------------------------------------------
// workspaceStatus.ts — Witness workspace status scanner (v3.3).
// ---------------------------------------------------------------------------
//
// Computes a WitnessWorkspaceStatus record by performing targeted, read-only
// scans of known paths under .witness/. Does not scan the full workspace. Does
// not use node:fs. Uses vscode.workspace.fs exclusively.
//
// Design invariants:
//   - computeWorkspaceStatus never throws. All I/O errors are caught and
//     produce safe defaults (false / null / 0).
//   - No file content is included in the returned record beyond what is needed
//     for status classification (risk level, mandatory markers, blocked/failed).
//   - No LLM calls, no automatic actions, no side effects.
//   - Ages are whole minutes computed from stat.mtime.
//   - The suggestedAction field is populated last by calling selectSuggestedAction.
//   - v3.2: subagent scanning delegated to computeSubagentHealth in subagentHealth.ts.
//   - v3.3: latestContextPacketHasMandatoryMarkers added; reads at most 4096 bytes.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { WitnessWorkspaceStatus, WitnessSuggestedAction } from './workspaceStatusTypes';
import { selectSuggestedAction } from './suggestedActions';
import { getCurrentSessionId } from './sessionRegistry';
import { computeSubagentHealth, emptySubagentHealthSummary } from './subagentHealth';

// Re-export types for consumers who import from workspaceStatus.ts directly.
export { WitnessWorkspaceStatus, WitnessSuggestedAction } from './workspaceStatusTypes';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Pattern matching context-packet files: `*-context-packet-NNN.md`. */
const CONTEXT_PACKET_PATTERN = /-context-packet-\d{3}\.md$/;

/** Pattern matching risk assessment files: `*-risk-NNN.md`. */
const RISK_FILE_PATTERN = /-risk-\d{3}\.md$/;

/**
 * Regex that extracts the final overall risk level from the risk file body.
 * Matches the "## Final Overall Level" heading followed by a bolded level
 * on the next non-empty line.
 *
 * The `s` flag (dotAll) allows `.` to match newlines, so the pattern spans
 * from the heading through the level value.
 */
const FINAL_RISK_LEVEL_RE =
  /##\s+Final Overall Level\s+\*\*(GREEN|YELLOW|ORANGE|RED|BLOCKED)\*\*/is;

// ---------------------------------------------------------------------------
// Internal filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Returns the FileStat for `uri`, or `null` if the file/directory does not
 * exist or cannot be accessed.
 */
async function statSilent(uri: vscode.Uri): Promise<vscode.FileStat | null> {
  try {
    return await vscode.workspace.fs.stat(uri);
  } catch {
    return null;
  }
}

/**
 * Returns the directory entries for `uri`, or an empty array if the directory
 * does not exist or cannot be read.
 */
async function readDirSilent(
  uri: vscode.Uri
): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return [];
  }
}

/**
 * Reads the UTF-8 text content of `uri`, or returns `null` if the file cannot
 * be read.
 */
async function readTextSilent(uri: vscode.Uri): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Converts a `stat.mtime` timestamp (milliseconds since epoch) to whole
 * minutes of age relative to the current wall-clock time.
 *
 * Returns `0` if mtime is in the future (clock skew guard).
 */
function ageMinutes(mtime: number): number {
  const diff = Date.now() - mtime;
  return diff > 0 ? Math.floor(diff / 60_000) : 0;
}

// ---------------------------------------------------------------------------
// Artifact-specific helpers
// ---------------------------------------------------------------------------

/**
 * Scans a directory for files whose names match `pattern` and returns the
 * URI and mtime of the most recently modified one.
 *
 * Returns `null` if no matching files exist or the directory cannot be read.
 */
async function findLatestByPattern(
  dir: vscode.Uri,
  pattern: RegExp
): Promise<{ uri: vscode.Uri; mtime: number } | null> {
  const entries = await readDirSilent(dir);
  let best: { uri: vscode.Uri; mtime: number } | null = null;

  for (const [name, fileType] of entries) {
    if (fileType !== vscode.FileType.File) {
      continue;
    }
    if (!pattern.test(name)) {
      continue;
    }

    const fileUri = vscode.Uri.joinPath(dir, name);
    const st = await statSilent(fileUri);
    if (st === null) {
      continue;
    }

    if (best === null || st.mtime > best.mtime) {
      best = { uri: fileUri, mtime: st.mtime };
    }
  }

  return best;
}

/**
 * Extracts the final overall risk level from risk file content.
 *
 * Looks for the "## Final Overall Level" section and returns the bolded level
 * value immediately following it. Returns `null` if the pattern is not found.
 *
 * Accepted values: GREEN, YELLOW, ORANGE, RED, BLOCKED.
 */
function extractRiskLevel(content: string): string | null {
  const match = FINAL_RISK_LEVEL_RE.exec(content);
  return match ? match[1].toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// Context packet mandatory-marker scan
// ---------------------------------------------------------------------------

/** The set of marker strings whose presence flags a context packet as unreviewed. */
const MANDATORY_MARKERS: readonly string[] = [
  '{{',
  'TODO',
  'MANDATORY',
  '[MISSING',
  '<fill',
];

/**
 * Reads at most the first 4096 bytes of `uri` as text and returns whether any
 * mandatory placeholder marker is present.
 *
 * Returns `null` if the file cannot be read.
 */
async function checkMandatoryMarkers(uri: vscode.Uri): Promise<boolean | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    // Decode only the first 4096 bytes to cap I/O cost for large packets.
    const slice = bytes.slice(0, 4096);
    const text = new TextDecoder().decode(slice);
    return MANDATORY_MARKERS.some(marker => text.includes(marker));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Telemetry event count
// ---------------------------------------------------------------------------

/**
 * Counts non-empty lines in `events.jsonl`.
 *
 * Returns 0 if the file does not exist or cannot be read.
 */
async function countTelemetryEvents(witnessRoot: vscode.Uri): Promise<number> {
  const eventsUri = vscode.Uri.joinPath(
    witnessRoot,
    'telemetry',
    'otel',
    'events.jsonl'
  );

  const text = await readTextSilent(eventsUri);
  if (text === null) {
    return 0;
  }

  // Count non-empty lines (trim to guard against blank trailing newlines).
  return text.split('\n').filter(line => line.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the current Witness workspace status by performing targeted reads
 * under `.witness/`.
 *
 * This function never throws. All I/O failures produce safe defaults. The
 * returned record is always complete — every field is populated.
 *
 * In v3.1, status is computed fresh on every call. No caching is applied.
 *
 * @param workspaceRoot - URI of the open workspace folder (first folder).
 * @returns A complete `WitnessWorkspaceStatus` record.
 */
export async function computeWorkspaceStatus(
  workspaceRoot: vscode.Uri
): Promise<WitnessWorkspaceStatus> {
  try {
    return await computeStatusInternal(workspaceRoot);
  } catch {
    // Fallback: return a minimal safe record if the internal function somehow
    // throws despite all internal error handling.
    const emptyHealthSummary = emptySubagentHealthSummary();
    const fallbackPartial = {
      hasWitness: false,
      activeSessionId: null,
      currentStateExists: false,
      currentStateAgeMinutes: null,
      latestHandoverExists: false,
      latestHandoverAgeMinutes: null,
      latestContextPacketExists: false,
      latestContextPacketAgeMinutes: null,
      latestContextPacketHasMandatoryMarkers: null,
      latestRiskLevel: null,
      latestRiskAgeMinutes: null,
      pendingSubagentReviews: 0,
      incompleteSubagentLedgers: 0,
      blockedOrFailedSubagents: 0,
      telemetryEventsExists: false,
      telemetryEventCount: 0,
      subagentHealthSummary: emptyHealthSummary,
    };

    return {
      ...fallbackPartial,
      suggestedAction: selectSuggestedAction(fallbackPartial),
    };
  }
}

/**
 * Core implementation of `computeWorkspaceStatus`. Each section catches its
 * own errors so that a failure in one probe does not affect others.
 */
async function computeStatusInternal(
  workspaceRoot: vscode.Uri
): Promise<WitnessWorkspaceStatus> {
  const witnessRoot = vscode.Uri.joinPath(workspaceRoot, '.witness');

  // -------------------------------------------------------------------------
  // 1. .witness/ presence
  // -------------------------------------------------------------------------

  const witnessStat = await statSilent(witnessRoot);
  const hasWitness = witnessStat !== null;

  // -------------------------------------------------------------------------
  // 2. Active session ID
  // -------------------------------------------------------------------------

  let activeSessionId: string | null = null;
  if (hasWitness) {
    try {
      const id = await getCurrentSessionId(witnessRoot);
      activeSessionId = id ?? null;
    } catch {
      activeSessionId = null;
    }
  }

  // -------------------------------------------------------------------------
  // 3. current-state.md
  // -------------------------------------------------------------------------

  let currentStateExists = false;
  let currentStateAgeMinutes: number | null = null;

  const currentStateStat = await statSilent(
    vscode.Uri.joinPath(witnessRoot, 'current-state.md')
  );
  if (currentStateStat !== null) {
    currentStateExists = true;
    currentStateAgeMinutes = ageMinutes(currentStateStat.mtime);
  }

  // -------------------------------------------------------------------------
  // 4. handovers/latest.md
  // -------------------------------------------------------------------------

  let latestHandoverExists = false;
  let latestHandoverAgeMinutes: number | null = null;

  const latestHandoverStat = await statSilent(
    vscode.Uri.joinPath(witnessRoot, 'handovers', 'latest.md')
  );
  if (latestHandoverStat !== null) {
    latestHandoverExists = true;
    latestHandoverAgeMinutes = ageMinutes(latestHandoverStat.mtime);
  }

  // -------------------------------------------------------------------------
  // 5. Latest context packet (sessions/*-context-packet-NNN.md)
  // -------------------------------------------------------------------------

  let latestContextPacketExists = false;
  let latestContextPacketAgeMinutes: number | null = null;
  let latestContextPacketHasMandatoryMarkers: boolean | null = null;

  const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
  const latestPacket = await findLatestByPattern(sessionsDir, CONTEXT_PACKET_PATTERN);
  if (latestPacket !== null) {
    latestContextPacketExists = true;
    latestContextPacketAgeMinutes = ageMinutes(latestPacket.mtime);
    latestContextPacketHasMandatoryMarkers = await checkMandatoryMarkers(latestPacket.uri);
  }

  // -------------------------------------------------------------------------
  // 6. Latest risk assessment (sessions/*-risk-NNN.md) and risk level
  // -------------------------------------------------------------------------

  let latestRiskLevel: string | null = null;
  let latestRiskAgeMinutes: number | null = null;

  const latestRisk = await findLatestByPattern(sessionsDir, RISK_FILE_PATTERN);
  if (latestRisk !== null) {
    latestRiskAgeMinutes = ageMinutes(latestRisk.mtime);
    const riskContent = await readTextSilent(latestRisk.uri);
    if (riskContent !== null) {
      latestRiskLevel = extractRiskLevel(riskContent);
    }
  }

  // -------------------------------------------------------------------------
  // 7. Subagent health (delegated to subagentHealth.ts in v3.2)
  // -------------------------------------------------------------------------

  const subagentHealthSummary = await computeSubagentHealth(workspaceRoot);

  // Derive the three aggregate counts consumed by suggestedActions.ts from
  // the full summary. Mapping:
  //   pendingSubagentReviews   = needsReviewCount
  //   incompleteSubagentLedgers = incompleteCount + loopRiskCount
  //   blockedOrFailedSubagents  = blockedCount
  const pendingSubagentReviews = subagentHealthSummary.needsReviewCount;
  const incompleteSubagentLedgers =
    subagentHealthSummary.incompleteCount + subagentHealthSummary.loopRiskCount;
  const blockedOrFailedSubagents = subagentHealthSummary.blockedCount;

  // -------------------------------------------------------------------------
  // 8. Telemetry event count
  // -------------------------------------------------------------------------

  const eventsUri = vscode.Uri.joinPath(witnessRoot, 'telemetry', 'otel', 'events.jsonl');
  const eventsStat = await statSilent(eventsUri);
  const telemetryEventsExists = eventsStat !== null;
  const telemetryEventCount = await countTelemetryEvents(witnessRoot);

  // -------------------------------------------------------------------------
  // 9. Suggested action (computed last, over all fields above)
  // -------------------------------------------------------------------------

  const partialStatus = {
    hasWitness,
    activeSessionId,
    currentStateExists,
    currentStateAgeMinutes,
    latestHandoverExists,
    latestHandoverAgeMinutes,
    latestContextPacketExists,
    latestContextPacketAgeMinutes,
    latestContextPacketHasMandatoryMarkers,
    latestRiskLevel,
    latestRiskAgeMinutes,
    pendingSubagentReviews,
    incompleteSubagentLedgers,
    blockedOrFailedSubagents,
    telemetryEventsExists,
    telemetryEventCount,
    subagentHealthSummary,
  };

  const suggestedAction = selectSuggestedAction(partialStatus);

  return {
    ...partialStatus,
    suggestedAction,
  };
}
