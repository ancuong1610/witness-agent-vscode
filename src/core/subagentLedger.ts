// ---------------------------------------------------------------------------
// subagentLedger.ts — path helpers and ordinal utilities for the v2 Subagent
// Ledger model.
// ---------------------------------------------------------------------------
//
// The Subagent Ledger model stores one ledger entry per subagent invocation as
// a directory of five stage files under `.witness/subagents/subagent-NNN/`.
// This module provides the path helpers, ordinal computation, and entry listing
// needed by the v2.4 ledger commands. It contains no command logic.
//
// It coexists with the v1 flat-file model (`subagent-NNN.md`). Both formats
// are scanned when computing the next ordinal so that ordinals are never
// reused across the two models.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The five lifecycle stages of a v2 Subagent Ledger entry.
 *
 * The stages represent the ordered lifecycle of a delegated subagent task:
 *   contract        — task definition and acceptance criteria agreed before dispatch
 *   context-packet  — minimum context assembled and reviewed before dispatch
 *   evidence        — execution record written immediately after the subagent completes
 *   report          — completion report evaluated against acceptance criteria
 *   review          — orchestrator review decision and integration record
 */
export type SubagentLedgerStage =
  | 'contract'
  | 'context-packet'
  | 'evidence'
  | 'report'
  | 'review';

/**
 * A single v2 Subagent Ledger entry as returned by {@link listSubagentLedgerEntries}.
 */
export interface SubagentLedgerEntry {
  /** Numeric ordinal parsed from the directory name (e.g. 1 for `subagent-001/`). */
  ordinal: number;
  /** Zero-padded string ID (e.g. `"subagent-001"`). */
  id: string;
  /** URI of the `subagent-NNN/` directory. */
  directoryUri: vscode.Uri;
  /** Stage files that exist inside the directory. */
  presentStages: SubagentLedgerStage[];
  /** Stage files that are missing from the directory. */
  missingStages: SubagentLedgerStage[];
  /** True only when all five stage files exist. */
  isComplete: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maps each {@link SubagentLedgerStage} to its filename inside the
 * `subagent-NNN/` ledger directory.
 */
export const SUBAGENT_LEDGER_STAGE_FILES: Record<SubagentLedgerStage, string> = {
  'contract': 'contract.md',
  'context-packet': 'context-packet.md',
  'evidence': 'evidence.md',
  'report': 'report.md',
  'review': 'review.md',
};

/** The five stages in canonical lifecycle order. */
const ALL_STAGES: SubagentLedgerStage[] = [
  'contract',
  'context-packet',
  'evidence',
  'report',
  'review',
];

// Regex patterns used when scanning `.witness/subagents/`.
const FLAT_FILE_PATTERN = /^subagent-(\d{3})\.md$/;
const LEDGER_DIR_PATTERN = /^subagent-(\d{3})$/;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the URI of `.witness/subagents/` for the given workspace root.
 *
 * @param workspaceRoot - URI of the open workspace folder.
 */
export function getSubagentsDir(workspaceRoot: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(workspaceRoot, '.witness', 'subagents');
}

/**
 * Returns a zero-padded three-digit string for the given ordinal.
 *
 * @example formatSubagentOrdinal(1)   → "001"
 * @example formatSubagentOrdinal(12)  → "012"
 * @example formatSubagentOrdinal(123) → "123"
 */
export function formatSubagentOrdinal(ordinal: number): string {
  return String(ordinal).padStart(3, '0');
}

/**
 * Returns the string identifier for a subagent ledger entry.
 *
 * @example formatSubagentId(1) → "subagent-001"
 */
export function formatSubagentId(ordinal: number): string {
  return `subagent-${formatSubagentOrdinal(ordinal)}`;
}

/**
 * Returns the URI of the `subagent-NNN/` ledger directory for the given
 * workspace root and ordinal.
 *
 * @param workspaceRoot - URI of the open workspace folder.
 * @param ordinal       - Numeric ordinal of the ledger entry.
 */
export function getSubagentLedgerDir(workspaceRoot: vscode.Uri, ordinal: number): vscode.Uri {
  return vscode.Uri.joinPath(
    getSubagentsDir(workspaceRoot),
    formatSubagentId(ordinal)
  );
}

/**
 * Returns the URI of a specific stage file inside a `subagent-NNN/` ledger
 * directory.
 *
 * @example
 *   getSubagentLedgerStageUri(root, 1, 'contract')
 *   → `.witness/subagents/subagent-001/contract.md`
 *
 * @param workspaceRoot - URI of the open workspace folder.
 * @param ordinal       - Numeric ordinal of the ledger entry.
 * @param stage         - The lifecycle stage to address.
 */
export function getSubagentLedgerStageUri(
  workspaceRoot: vscode.Uri,
  ordinal: number,
  stage: SubagentLedgerStage
): vscode.Uri {
  return vscode.Uri.joinPath(
    getSubagentLedgerDir(workspaceRoot, ordinal),
    SUBAGENT_LEDGER_STAGE_FILES[stage]
  );
}

// ---------------------------------------------------------------------------
// Ordinal computation
// ---------------------------------------------------------------------------

/**
 * Scans `.witness/subagents/` and returns the next available ordinal.
 *
 * Both v1 flat files (`subagent-NNN.md`) and v2 ledger directories
 * (`subagent-NNN/`) are considered so that ordinals are never reused across
 * the two models.
 *
 * Returns `1` if the directory does not exist or is empty.
 * Ignores malformed names. Filesystem errors are swallowed, consistent with
 * the existing project convention (see `observeWorkspace.ts`, `assessRisk.ts`).
 *
 * @param workspaceRoot - URI of the open workspace folder.
 */
export async function getNextSubagentOrdinal(workspaceRoot: vscode.Uri): Promise<number> {
  const subagentsDir = getSubagentsDir(workspaceRoot);
  let maxOrdinal = 0;

  try {
    const entries = await vscode.workspace.fs.readDirectory(subagentsDir);

    for (const [name, fileType] of entries) {
      if (fileType === vscode.FileType.File) {
        const match = FLAT_FILE_PATTERN.exec(name);
        if (match) {
          const ordinal = parseInt(match[1], 10);
          if (ordinal > maxOrdinal) {
            maxOrdinal = ordinal;
          }
        }
      } else if (fileType === vscode.FileType.Directory) {
        const match = LEDGER_DIR_PATTERN.exec(name);
        if (match) {
          const ordinal = parseInt(match[1], 10);
          if (ordinal > maxOrdinal) {
            maxOrdinal = ordinal;
          }
        }
      }
    }
  } catch {
    // Directory does not exist or cannot be read — return first ordinal.
  }

  return maxOrdinal + 1;
}

// ---------------------------------------------------------------------------
// Ledger entry listing
// ---------------------------------------------------------------------------

/**
 * Scans `.witness/subagents/` and returns all v2 ledger entries.
 *
 * Only directory-based entries (`subagent-NNN/`) are included. v1 flat files
 * (`subagent-NNN.md`) are ignored. For each directory, the presence of each
 * stage file is checked via `vscode.workspace.fs.stat`.
 *
 * Returns an empty array if `.witness/subagents/` does not exist.
 * Entries are sorted by ordinal ascending.
 *
 * @param workspaceRoot - URI of the open workspace folder.
 */
export async function listSubagentLedgerEntries(
  workspaceRoot: vscode.Uri
): Promise<SubagentLedgerEntry[]> {
  const subagentsDir = getSubagentsDir(workspaceRoot);
  let topEntries: [string, vscode.FileType][] = [];

  try {
    topEntries = await vscode.workspace.fs.readDirectory(subagentsDir);
  } catch {
    // Directory does not exist — return empty.
    return [];
  }

  const results: SubagentLedgerEntry[] = [];

  for (const [name, fileType] of topEntries) {
    if (fileType !== vscode.FileType.Directory) {
      continue;
    }

    const match = LEDGER_DIR_PATTERN.exec(name);
    if (!match) {
      continue;
    }

    const ordinal = parseInt(match[1], 10);
    const directoryUri = vscode.Uri.joinPath(subagentsDir, name);

    // Check which stage files exist inside this directory.
    const presentStages: SubagentLedgerStage[] = [];
    const missingStages: SubagentLedgerStage[] = [];

    for (const stage of ALL_STAGES) {
      const stageUri = vscode.Uri.joinPath(
        directoryUri,
        SUBAGENT_LEDGER_STAGE_FILES[stage]
      );
      let exists = false;
      try {
        await vscode.workspace.fs.stat(stageUri);
        exists = true;
      } catch {
        exists = false;
      }

      if (exists) {
        presentStages.push(stage);
      } else {
        missingStages.push(stage);
      }
    }

    results.push({
      ordinal,
      id: formatSubagentId(ordinal),
      directoryUri,
      presentStages,
      missingStages,
      isComplete: missingStages.length === 0,
    });
  }

  // Sort by ordinal ascending.
  results.sort((a, b) => a.ordinal - b.ordinal);

  return results;
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/**
 * Returns ledger entries where the given stage file is missing.
 * Preserves input order.
 *
 * @param entries - Array of ledger entries, typically from `listSubagentLedgerEntries`.
 * @param stage   - The stage to filter by.
 */
export function filterLedgerEntriesByMissingStage(
  entries: SubagentLedgerEntry[],
  stage: SubagentLedgerStage
): SubagentLedgerEntry[] {
  return entries.filter(e => e.missingStages.includes(stage));
}

/**
 * Returns ledger entries where the given stage file is present.
 * Preserves input order.
 *
 * @param entries - Array of ledger entries, typically from `listSubagentLedgerEntries`.
 * @param stage   - The stage to filter by.
 */
export function filterLedgerEntriesByPresentStage(
  entries: SubagentLedgerEntry[],
  stage: SubagentLedgerStage
): SubagentLedgerEntry[] {
  return entries.filter(e => e.presentStages.includes(stage));
}
