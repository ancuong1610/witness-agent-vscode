// ---------------------------------------------------------------------------
// subagentHealth.ts — Subagent Health Monitor (v3.2).
// ---------------------------------------------------------------------------
//
// Scans `.witness/subagents/` and classifies each entry — both v1 flat files
// and v2 ledger directories — into a deterministic health level.
//
// Design invariants:
//   - computeSubagentHealth never throws. All I/O errors produce safe defaults.
//   - Uses vscode.workspace.fs exclusively. No node:fs.
//   - No file content written to telemetry or returned records beyond extracted
//     field values (status string, review decision string).
//   - All blocking/failed detection uses anchored regex, not broad includes.
//   - Classification rules applied in strict priority order.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The five possible health levels for a subagent record.
 *
 * Applied in classification priority order (see classifyLedgerEntry):
 *   blocked      — a blocked, failed, or rejected field indicator was found.
 *   healthy      — all five stages present and review is accepted.
 *   needs-review — report present but no orchestrator review yet.
 *   loop-risk    — evidence present, no report, and evidence is stale.
 *   incomplete   — contract present but no completion report.
 */
export type SubagentHealthLevel =
  | 'healthy'
  | 'needs-review'
  | 'incomplete'
  | 'blocked'
  | 'loop-risk';

/**
 * Health classification for a single subagent record — either a v1 flat file
 * or a v2 ledger directory entry.
 */
export interface SubagentHealthRecord {
  /** Numeric ordinal parsed from the filename or directory name (e.g. 1 for `subagent-001`). */
  ordinal: number;

  /** Zero-padded string ID (e.g. `"subagent-001"`). */
  id: string;

  /** Whether this is a v1 flat file or a v2 five-stage ledger directory. */
  format: 'flat' | 'ledger';

  /** Classified health level. */
  healthLevel: SubagentHealthLevel;

  /**
   * Stage filenames present in the entry.
   * For flat files: always `["report.md"]`.
   * For ledger entries: subset of the five canonical stage filenames.
   */
  stagesPresent: string[];

  /**
   * Stage filenames absent from the entry.
   * For flat files: always `["review.md"]`.
   * For ledger entries: complement of `stagesPresent`.
   */
  stagesMissing: string[];

  /**
   * Age in whole minutes of the most recently modified present stage file,
   * or `null` if no stage files are present.
   * For flat files: age of the file itself.
   */
  ageMinutes: number | null;

  /**
   * Extracted value of the `Decision` or `Review Decision` field from
   * `review.md`, or `null` if the file is absent or the field is not found.
   */
  reviewDecision: string | null;

  /**
   * Extracted value of the `Status` field from `report.md` or `evidence.md`
   * (report.md checked first), or `null` if neither file is present or
   * the field is not found.
   */
  status: string | null;

  /**
   * Workspace-relative path to the entry.
   * Examples:
   *   `.witness/subagents/subagent-001.md`   (flat)
   *   `.witness/subagents/subagent-002/`      (ledger)
   */
  path: string;
}

/**
 * Aggregate summary of all subagent health records in the workspace.
 */
export interface SubagentHealthSummary {
  /** All classified records, sorted by ordinal ascending. */
  entries: SubagentHealthRecord[];

  /** Total count of records (flat + ledger). */
  totalCount: number;

  /** Count of records classified as `healthy`. */
  healthyCount: number;

  /** Count of records classified as `needs-review`. */
  needsReviewCount: number;

  /** Count of records classified as `incomplete`. */
  incompleteCount: number;

  /** Count of records classified as `blocked`. */
  blockedCount: number;

  /** Count of records classified as `loop-risk`. */
  loopRiskCount: number;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Threshold age in minutes above which a stale evidence file triggers `loop-risk`. */
const LOOP_RISK_EVIDENCE_MINUTES = 60;

/** Pattern matching v2 ledger directories inside `.witness/subagents/`. */
const LEDGER_DIR_PATTERN = /^subagent-(\d{3})$/;

/** Pattern matching v1 flat subagent report files inside `.witness/subagents/`. */
const FLAT_FILE_PATTERN = /^subagent-(\d{3})\.md$/;

/** The five canonical ledger stage filenames in lifecycle order. */
const ALL_LEDGER_STAGE_FILES: string[] = [
  'contract.md',
  'context-packet.md',
  'evidence.md',
  'report.md',
  'review.md',
];

/**
 * Anchored, case-insensitive regex detecting a field-level `Status` line
 * indicating a blocked or failed state.
 *
 * Matches:   "Status: blocked"  /  "  Status : Failed"
 * Does not match:  "## Known Blockers" or prose containing "blocked"
 */
const STATUS_BLOCKED_FAILED_RE = /^\s*Status\s*:\s*(blocked|failed)\b/im;

/**
 * Anchored, case-insensitive regex detecting a field-level Decision line
 * indicating a rejected outcome.
 */
const DECISION_REJECTED_RE = /^\s*(Review Decision|Decision)\s*:\s*rejected\b/im;

/**
 * Anchored, case-insensitive regex detecting an accepted review decision.
 * Matches: accepted / accepted-with-conditions / accepted with conditions
 */
const ACCEPTED_DECISION_RE =
  /^\s*(Review Decision|Decision)\s*:\s*(accepted|accepted-with-conditions|accepted with conditions)\b/im;

/**
 * Regex for extracting the raw value of a `Status` field line.
 * Capture group 1 is the trimmed value string.
 */
const STATUS_VALUE_RE = /^\s*Status\s*:\s*(.+)/im;

/**
 * Regex for extracting the raw value of a `Decision` or `Review Decision`
 * field line. Capture group 1 is the trimmed value string.
 */
const DECISION_VALUE_RE = /^\s*(?:Review Decision|Decision)\s*:\s*(.+)/im;

// ---------------------------------------------------------------------------
// Internal filesystem helpers
// ---------------------------------------------------------------------------

async function statSilent(uri: vscode.Uri): Promise<vscode.FileStat | null> {
  try {
    return await vscode.workspace.fs.stat(uri);
  } catch {
    return null;
  }
}

async function readDirSilent(
  uri: vscode.Uri
): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return [];
  }
}

async function readTextSilent(uri: vscode.Uri): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Converts a `stat.mtime` millisecond timestamp to whole minutes of age.
 * Returns `0` as a clock-skew guard if mtime is in the future.
 */
function ageMinutes(mtime: number): number {
  const diff = Date.now() - mtime;
  return diff > 0 ? Math.floor(diff / 60_000) : 0;
}

// ---------------------------------------------------------------------------
// Field-value extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the trimmed value following a `Status:` field line in `content`.
 * Returns `null` if the field is not present.
 */
function extractStatus(content: string): string | null {
  const match = STATUS_VALUE_RE.exec(content);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the trimmed value following a `Decision:` or `Review Decision:`
 * field line in `content`. Returns `null` if the field is not present.
 */
function extractDecision(content: string): string | null {
  const match = DECISION_VALUE_RE.exec(content);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Classification predicates
// ---------------------------------------------------------------------------

function isBlockedOrFailed(content: string): boolean {
  return STATUS_BLOCKED_FAILED_RE.test(content) || DECISION_REJECTED_RE.test(content);
}

function hasAcceptedDecision(content: string): boolean {
  return ACCEPTED_DECISION_RE.test(content);
}

// ---------------------------------------------------------------------------
// v2 Ledger entry classification
// ---------------------------------------------------------------------------

interface LedgerStageInfo {
  filename: string;
  exists: boolean;
  mtime: number | null;
  content: string | null;
}

/**
 * Classifies a single v2 ledger directory entry and returns a
 * `SubagentHealthRecord`.
 */
async function classifyLedgerEntry(
  subagentsDir: vscode.Uri,
  name: string,
  ordinal: number
): Promise<SubagentHealthRecord> {
  const entryDir = vscode.Uri.joinPath(subagentsDir, name);
  const id = name; // e.g. "subagent-001"
  const path = `.witness/subagents/${name}/`;

  // -------------------------------------------------------------------------
  // Stat and optionally read each stage file.
  //
  // We read content for: evidence.md, report.md, review.md (the three files
  // that can carry Status or Decision fields used for classification). We do
  // not read contract.md or context-packet.md content — only their existence
  // matters for classification rules.
  // -------------------------------------------------------------------------

  const stages: LedgerStageInfo[] = [];

  for (const filename of ALL_LEDGER_STAGE_FILES) {
    const uri = vscode.Uri.joinPath(entryDir, filename);
    const st = await statSilent(uri);

    let content: string | null = null;
    if (st !== null && (filename === 'evidence.md' || filename === 'report.md' || filename === 'review.md')) {
      content = await readTextSilent(uri);
    }

    stages.push({
      filename,
      exists: st !== null,
      mtime: st !== null ? st.mtime : null,
      content,
    });
  }

  // Derived maps for convenience.
  const byName = new Map(stages.map(s => [s.filename, s]));

  const stagesPresent = stages.filter(s => s.exists).map(s => s.filename);
  const stagesMissing = stages.filter(s => !s.exists).map(s => s.filename);

  const contractExists = byName.get('contract.md')!.exists;
  const evidenceInfo = byName.get('evidence.md')!;
  const reportInfo = byName.get('report.md')!;
  const reviewInfo = byName.get('review.md')!;

  // Compute entry age: mtime of the most recently modified present stage file.
  let latestMtime: number | null = null;
  for (const s of stages) {
    if (s.exists && s.mtime !== null) {
      if (latestMtime === null || s.mtime > latestMtime) {
        latestMtime = s.mtime;
      }
    }
  }
  const entryAgeMinutes = latestMtime !== null ? ageMinutes(latestMtime) : null;

  // Extract review decision and status values.
  const reviewDecision =
    reviewInfo.exists && reviewInfo.content !== null
      ? extractDecision(reviewInfo.content)
      : null;

  let status: string | null = null;
  if (reportInfo.exists && reportInfo.content !== null) {
    status = extractStatus(reportInfo.content);
  } else if (evidenceInfo.exists && evidenceInfo.content !== null) {
    status = extractStatus(evidenceInfo.content);
  }

  // -------------------------------------------------------------------------
  // Classification — rules applied in strict priority order.
  // -------------------------------------------------------------------------

  // Rule 1: blocked — any of evidence.md, report.md, review.md signals blocked/failed/rejected.
  const checkForBlocked = [evidenceInfo, reportInfo, reviewInfo];
  for (const s of checkForBlocked) {
    if (s.exists && s.content !== null && isBlockedOrFailed(s.content)) {
      return {
        ordinal,
        id,
        format: 'ledger',
        healthLevel: 'blocked',
        stagesPresent,
        stagesMissing,
        ageMinutes: entryAgeMinutes,
        reviewDecision,
        status,
        path,
      };
    }
  }

  // Rule 2: healthy — all five stages present and review is accepted.
  if (
    stagesMissing.length === 0 &&
    reviewInfo.content !== null &&
    hasAcceptedDecision(reviewInfo.content)
  ) {
    return {
      ordinal,
      id,
      format: 'ledger',
      healthLevel: 'healthy',
      stagesPresent,
      stagesMissing,
      ageMinutes: entryAgeMinutes,
      reviewDecision,
      status,
      path,
    };
  }

  // Rule 3: needs-review — report present, review absent.
  if (reportInfo.exists && !reviewInfo.exists) {
    return {
      ordinal,
      id,
      format: 'ledger',
      healthLevel: 'needs-review',
      stagesPresent,
      stagesMissing,
      ageMinutes: entryAgeMinutes,
      reviewDecision,
      status,
      path,
    };
  }

  // Rule 4: loop-risk — evidence present, report absent, evidence stale.
  if (
    evidenceInfo.exists &&
    !reportInfo.exists &&
    evidenceInfo.mtime !== null &&
    ageMinutes(evidenceInfo.mtime) >= LOOP_RISK_EVIDENCE_MINUTES
  ) {
    return {
      ordinal,
      id,
      format: 'ledger',
      healthLevel: 'loop-risk',
      stagesPresent,
      stagesMissing,
      ageMinutes: entryAgeMinutes,
      reviewDecision,
      status,
      path,
    };
  }

  // Rule 5: incomplete — contract present, report absent.
  if (contractExists && !reportInfo.exists) {
    return {
      ordinal,
      id,
      format: 'ledger',
      healthLevel: 'incomplete',
      stagesPresent,
      stagesMissing,
      ageMinutes: entryAgeMinutes,
      reviewDecision,
      status,
      path,
    };
  }

  // Default: incomplete.
  return {
    ordinal,
    id,
    format: 'ledger',
    healthLevel: 'incomplete',
    stagesPresent,
    stagesMissing,
    ageMinutes: entryAgeMinutes,
    reviewDecision,
    status,
    path,
  };
}

// ---------------------------------------------------------------------------
// v1 flat file classification
// ---------------------------------------------------------------------------

/**
 * Classifies a single v1 flat `subagent-NNN.md` file and returns a
 * `SubagentHealthRecord`.
 */
async function classifyFlatFile(
  subagentsDir: vscode.Uri,
  name: string,
  ordinal: number
): Promise<SubagentHealthRecord> {
  const flatUri = vscode.Uri.joinPath(subagentsDir, name);
  const id = name.replace(/\.md$/, ''); // e.g. "subagent-001"
  const path = `.witness/subagents/${name}`;

  const st = await statSilent(flatUri);
  const entryAgeMinutes = st !== null ? ageMinutes(st.mtime) : null;

  const content = await readTextSilent(flatUri);
  const status = content !== null ? extractStatus(content) : null;

  // v1 flat: default health is needs-review; blocked if Status field indicates it.
  let healthLevel: SubagentHealthLevel = 'needs-review';
  if (content !== null && isBlockedOrFailed(content)) {
    healthLevel = 'blocked';
  }

  return {
    ordinal,
    id,
    format: 'flat',
    healthLevel,
    stagesPresent: ['report.md'],
    stagesMissing: ['review.md'],
    ageMinutes: entryAgeMinutes,
    reviewDecision: null,
    status,
    path,
  };
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

/**
 * Builds an empty `SubagentHealthSummary` with all counts zero and no entries.
 */
export function emptySubagentHealthSummary(): SubagentHealthSummary {
  return {
    entries: [],
    totalCount: 0,
    healthyCount: 0,
    needsReviewCount: 0,
    incompleteCount: 0,
    blockedCount: 0,
    loopRiskCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans `.witness/subagents/` and returns a health summary for all subagent
 * records found — both v1 flat files and v2 ledger directories.
 *
 * This function never throws. If `.witness/subagents/` is missing or
 * unreadable, an empty summary is returned.
 *
 * Entries in the returned summary are sorted by ordinal ascending.
 *
 * @param workspaceRoot - URI of the open workspace folder.
 * @returns A complete `SubagentHealthSummary`.
 */
export async function computeSubagentHealth(
  workspaceRoot: vscode.Uri
): Promise<SubagentHealthSummary> {
  try {
    return await computeHealthInternal(workspaceRoot);
  } catch {
    return emptySubagentHealthSummary();
  }
}

async function computeHealthInternal(
  workspaceRoot: vscode.Uri
): Promise<SubagentHealthSummary> {
  const subagentsDir = vscode.Uri.joinPath(workspaceRoot, '.witness', 'subagents');
  const topEntries = await readDirSilent(subagentsDir);

  const records: SubagentHealthRecord[] = [];

  for (const [name, fileType] of topEntries) {
    if (fileType === vscode.FileType.Directory) {
      const match = LEDGER_DIR_PATTERN.exec(name);
      if (!match) {
        continue;
      }
      const ordinal = parseInt(match[1], 10);
      const record = await classifyLedgerEntry(subagentsDir, name, ordinal);
      records.push(record);
    } else if (fileType === vscode.FileType.File) {
      const match = FLAT_FILE_PATTERN.exec(name);
      if (!match) {
        continue;
      }
      const ordinal = parseInt(match[1], 10);
      const record = await classifyFlatFile(subagentsDir, name, ordinal);
      records.push(record);
    }
  }

  // Sort ascending by ordinal.
  records.sort((a, b) => a.ordinal - b.ordinal);

  // Compute aggregate counts.
  let healthyCount = 0;
  let needsReviewCount = 0;
  let incompleteCount = 0;
  let blockedCount = 0;
  let loopRiskCount = 0;

  for (const r of records) {
    switch (r.healthLevel) {
      case 'healthy':      healthyCount++;      break;
      case 'needs-review': needsReviewCount++;  break;
      case 'incomplete':   incompleteCount++;   break;
      case 'blocked':      blockedCount++;      break;
      case 'loop-risk':    loopRiskCount++;     break;
    }
  }

  return {
    entries: records,
    totalCount: records.length,
    healthyCount,
    needsReviewCount,
    incompleteCount,
    blockedCount,
    loopRiskCount,
  };
}
