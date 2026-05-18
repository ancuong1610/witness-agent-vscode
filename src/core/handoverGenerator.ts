import * as vscode from 'vscode';
import { loadTemplate } from './templates';
import { readFile } from './artifactWriter';
import { formatLocalTimestamp } from './time';

// ---------------------------------------------------------------------------
// handoverGenerator.ts — pure data-gathering + rendering module
// No command logic. No user prompts. No VS Code UI calls.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Inputs required to generate a handover document.
 */
export interface HandoverInputs {
  witnessRoot: vscode.Uri;
  workspaceRoot: vscode.Uri;
  sessionId: string;
  /** Needed for loadTemplate — pass the extension activation context. */
  context: vscode.ExtensionContext;
}

/**
 * References to artifact files found in `.witness/` for a given session.
 * All fields are "best effort" — missing directories produce empty results
 * rather than errors.
 */
export interface HandoverArtifactRefs {
  /** Filename only, e.g. "2026-05-12-001-risk-002.md". Undefined if none found. */
  latestRiskFile?: string;
  /** Filename only. Undefined if none found. */
  latestObservationFile?: string;
  /** Filename only, from telemetry/<session-id>/. Undefined if none found. */
  latestContextPressureFile?: string;
  /** True iff .witness/current-state.md exists. */
  currentStateExists: boolean;
  /** Filenames in decisions/ whose content contains `**Session**: <sessionId>`. */
  adrFiles: string[];
  /** Filenames in subagents/ whose content contains the sessionId string anywhere. */
  subagentFiles: string[];
}

/**
 * The fully rendered handover, ready to write to disk.
 */
export interface GeneratedHandover {
  /** e.g. "handover-2026-05-12-001-001" */
  handoverId: string;
  /** Full markdown content. */
  content: string;
  /** Artifact references used to build this handover. */
  artifactRefs: HandoverArtifactRefs;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a string for safe use inside a `RegExp` constructor.
 * Same pattern as observeWorkspace.ts and assessRisk.ts.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads a directory, returning an empty array if it does not exist or cannot
 * be read. This is the "resilient scan" pattern used throughout the codebase.
 */
async function safeReadDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return [];
  }
}

/**
 * Reads a file's text content, returning undefined if the file does not exist.
 */
async function safeReadFile(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return await readFile(uri);
  } catch {
    return undefined;
  }
}

/**
 * Scans a directory for files matching a regex and returns the filename with
 * the highest captured ordinal group (group 1), plus that ordinal.
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
// Public API — gatherArtifactRefs
// ---------------------------------------------------------------------------

/**
 * Scans `.witness/` for artifact files relevant to the given session and
 * returns a summary of what was found.
 *
 * All directory reads are resilient — a missing directory is treated as empty
 * rather than throwing.
 */
export async function gatherArtifactRefs(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<HandoverArtifactRefs> {
  const escaped = escapeRegExp(sessionId);

  // 1. Sessions directory — scan for risk and observation files.
  const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
  const sessionsEntries = await safeReadDirectory(sessionsDir);

  const riskPattern = new RegExp(`^${escaped}-risk-(\\d{3})\\.md$`);
  const observationPattern = new RegExp(`^${escaped}-observation-(\\d{3})\\.md$`);

  const latestRiskFile = pickHighestOrdinal(sessionsEntries, riskPattern);
  const latestObservationFile = pickHighestOrdinal(sessionsEntries, observationPattern);

  // 2. Telemetry directory — scan for context-pressure files.
  const telemetryDir = vscode.Uri.joinPath(witnessRoot, 'telemetry', sessionId);
  const telemetryEntries = await safeReadDirectory(telemetryDir);

  const pressurePattern = /^context-pressure-(\d{3})\.md$/;
  const latestContextPressureFile = pickHighestOrdinal(telemetryEntries, pressurePattern);

  // 3. current-state.md existence check.
  const currentStateUri = vscode.Uri.joinPath(witnessRoot, 'current-state.md');
  let currentStateExists = false;
  try {
    await vscode.workspace.fs.stat(currentStateUri);
    currentStateExists = true;
  } catch {
    currentStateExists = false;
  }

  // 4. ADR files referencing this session.
  //    Look for the literal string `**Session**: <sessionId>` injected by createADR.ts.
  const decisionsDir = vscode.Uri.joinPath(witnessRoot, 'decisions');
  const decisionsEntries = await safeReadDirectory(decisionsDir);
  const adrFiles: string[] = [];

  for (const [name, type] of decisionsEntries) {
    if (type !== vscode.FileType.File || !name.endsWith('.md')) {
      continue;
    }
    const fileUri = vscode.Uri.joinPath(decisionsDir, name);
    const text = await safeReadFile(fileUri);
    if (text !== undefined && text.includes(`**Session**: ${sessionId}`)) {
      adrFiles.push(name);
    }
  }

  // 5. Subagent files referencing this session.
  //    The sessionId appears as the "Parent Session" value substituted from
  //    {{SESSION_ID}} in recordSubagent.ts. Look for any occurrence of the
  //    session ID anywhere in the file.
  const subagentsDir = vscode.Uri.joinPath(witnessRoot, 'subagents');
  const subagentsEntries = await safeReadDirectory(subagentsDir);
  const subagentFiles: string[] = [];

  for (const [name, type] of subagentsEntries) {
    if (type !== vscode.FileType.File || !name.endsWith('.md')) {
      continue;
    }
    const fileUri = vscode.Uri.joinPath(subagentsDir, name);
    const text = await safeReadFile(fileUri);
    if (text !== undefined && text.includes(sessionId)) {
      subagentFiles.push(name);
    }
  }

  return {
    latestRiskFile,
    latestObservationFile,
    latestContextPressureFile,
    currentStateExists,
    adrFiles,
    subagentFiles,
  };
}

// ---------------------------------------------------------------------------
// Public API — nextHandoverOrdinal
// ---------------------------------------------------------------------------

/**
 * Scans `.witness/handovers/` for files matching
 * `^handover-<sessionId>-(\d{3})\.md$` (which excludes `latest.md` by design)
 * and returns the next ordinal as a zero-padded 3-digit string.
 *
 * Returns `"001"` if no handovers for this session exist yet.
 */
export async function nextHandoverOrdinal(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<string> {
  const handoversDir = vscode.Uri.joinPath(witnessRoot, 'handovers');
  const entries = await safeReadDirectory(handoversDir);

  const escaped = escapeRegExp(sessionId);
  const pattern = new RegExp(`^handover-${escaped}-(\\d{3})\\.md$`);

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
// Risk file parsing helpers
// ---------------------------------------------------------------------------

/**
 * The five locked risk dimension labels in canonical order.
 * Must match RISK_DIMENSIONS in riskEngine.ts exactly.
 */
const LOCKED_DIMENSIONS = [
  'Active Context Pressure',
  'Artifact Externalization Gap',
  'Subagent Boundary Risk',
  'Quality Drift',
  'Phase Boundary Risk',
] as const;

interface DimensionRow {
  dimension: string;
  level: string;
  rationale: string;
}

/**
 * Parses the risk dimension table from a risk assessment file's text content.
 * Returns one row per locked dimension in canonical order.
 * If a dimension row is absent or its level is still a `{{...}}` placeholder,
 * the level is set to `(no assessment)` and the rationale to the gap marker.
 */
function parseRiskDimensionRows(riskText: string): DimensionRow[] {
  // Build a map from dimension label → {level, rationale} by scanning lines.
  const found = new Map<string, { level: string; rationale: string }>();

  for (const rawLine of riskText.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) {
      continue;
    }

    // Split on | and trim each cell. A typical row looks like:
    // | Active Context Pressure | YELLOW | some rationale |
    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length < 3) {
      continue;
    }

    const dimension = cells[0];
    const level = cells[1];
    const rationale = cells[2];

    // Skip header and separator rows.
    if (
      dimension === 'Dimension' ||
      dimension.startsWith('-') ||
      level.startsWith('-')
    ) {
      continue;
    }

    // Only collect rows for locked dimension names.
    if (!LOCKED_DIMENSIONS.includes(dimension as (typeof LOCKED_DIMENSIONS)[number])) {
      continue;
    }

    // Skip rows where the level is still a {{...}} placeholder.
    if (/^\{\{/.test(level)) {
      continue;
    }

    found.set(dimension, { level, rationale });
  }

  return LOCKED_DIMENSIONS.map(dim => {
    const row = found.get(dim);
    if (row) {
      return { dimension: dim, level: row.level, rationale: row.rationale };
    }
    return {
      dimension: dim,
      level: '(no assessment)',
      rationale: '(run Witness: Assess Continuity Risk)',
    };
  });
}

/**
 * Parses the `## Final Overall Level` section from a risk file.
 * Looks for a line of the form `**<LEVEL>**` immediately following the heading.
 * Returns the level string (e.g. `"RED"`) or undefined if not found.
 */
function parseOverallLevel(riskText: string): string | undefined {
  const lines = riskText.split('\n');
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === '## Final Overall Level') {
      inSection = true;
      continue;
    }

    if (inSection) {
      if (line.length === 0) {
        continue; // skip blank lines
      }
      if (line.startsWith('#')) {
        break; // next section — level not found
      }
      // Match **LEVEL** pattern.
      const match = /^\*\*([A-Z]+)\*\*$/.exec(line);
      if (match) {
        return match[1];
      }
      break;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Observation file parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parses the dirty file paths from the "**Dirty file paths**" section of an
 * observation file. Returns the list of paths (without the leading "- ").
 * Returns an empty array if the section is absent or has no paths.
 */
function parseDirtyFiles(observationText: string): string[] {
  const lines = observationText.split('\n');
  const paths: string[] = [];
  let inDirtySection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('**Dirty file paths**')) {
      inDirtySection = true;
      continue;
    }

    if (inDirtySection) {
      if (line.startsWith('- ')) {
        paths.push(line.slice(2));
      } else if (line.length > 0 && !line.startsWith('-')) {
        // End of the bulleted list.
        break;
      }
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Public API — generateHandoverContent
// ---------------------------------------------------------------------------

/**
 * Loads `handover-template.md` and substitutes every `{{...}}` placeholder
 * with real data, explicit gap markers, or rendered content from artifact files.
 *
 * Placeholder disposition legend (see template for context):
 *
 *   SUBSTITUTED = replaced with real data value.
 *   RENDERED    = replaced with structured content derived from an artifact.
 *   GAP_MARKER  = replaced with an explicit "(no X recorded yet — run Witness: Y)" message.
 *   MANDATORY   = replaced with "(MANDATORY: fill in ...)" for fields that must be human-authored.
 *
 * Every `{{...}}` in the original template is addressed below. None are left unprocessed.
 *
 * Placeholder inventory (reading the template top-to-bottom):
 *
 *   {{HANDOVER_ID}}                         → SUBSTITUTED (handover-<sessionId>-<NNN>)
 *   {{SESSION_ID}}                          → SUBSTITUTED (session ID, appears 3×)
 *   {{YYYY-MM-DDTHH:MM:SSZ}}               → SUBSTITUTED (ISO timestamp, appears 2× — Generated At + Last Validation)
 *   {{GREEN/YELLOW/ORANGE/RED/BLOCKED}}     → RENDERED or GAP_MARKER (5× risk dimension level cells)
 *   {{one-line rationale}}                  → RENDERED or GAP_MARKER (5× risk dimension rationale cells)
 *   {{GREEN / YELLOW / ORANGE / RED / BLOCKED}} → RENDERED or GAP_MARKER (Recommended Risk Level bold)
 *   {{RISK_LEVEL_EXPLANATION}}              → GAP_MARKER
 *   {{PROJECT_NAME}}                        → RENDERED (points to current-state.md) or GAP_MARKER
 *   {{CURRENT_PHASE}}                       → RENDERED (points to current-state.md) or GAP_MARKER
 *   {{ACTIVE_SLICE_OR_FEATURE}}             → RENDERED (points to current-state.md) or GAP_MARKER
 *   {{CONSTRAINT_1}}                        → RENDERED (points to current-state.md) or GAP_MARKER
 *   {{CONSTRAINT_2}}                        → RENDERED (points to current-state.md) or GAP_MARKER
 *   {{FILE_PATH}}                           → RENDERED from observation or GAP_MARKER
 *   {{mid-edit / partially applied / review-needed}} → RENDERED from observation or GAP_MARKER
 *   {{specific note}}                       → RENDERED from observation or GAP_MARKER
 *   {{DECISION}}                            → GAP_MARKER (no structured source in v0.1)
 *   {{why it is unresolved}}                → GAP_MARKER
 *   {{high / medium / low}}                 → GAP_MARKER
 *   {{unit tests / integration tests / build / lint / none}} → GAP_MARKER
 *   {{passed / failed / partial / not run}} → GAP_MARKER
 *   {{list any failures, or "none"}}        → GAP_MARKER
 *   {{NEXT_SAFE_STEP}}                      → MANDATORY
 *   {{PROHIBITED_ACTION_1}}                 → MANDATORY
 *   {{PROHIBITED_ACTION_2}}                 → MANDATORY
 *   {{REASON}}                              → MANDATORY (appears 2×)
 *   {{NNN}}                                 → RENDERED from adrFiles (appears 3×)
 *   {{title}}                               → RENDERED from adrFiles
 *   {{slug}}                                → RENDERED from adrFiles
 *   {{SUBAGENT_ID}}                         → RENDERED from subagentFiles (appears 2×)
 *   {{SESSION_FILE}}                        → SUBSTITUTED (same as SESSION_ID)
 */
export async function generateHandoverContent(
  inputs: HandoverInputs,
  refs: HandoverArtifactRefs,
  handoverNNN: string
): Promise<string> {
  const { witnessRoot, sessionId, context } = inputs;
  const handoverId = `handover-${sessionId}-${handoverNNN}`;
  const generatedAt = formatLocalTimestamp();

  // Load the template.
  let content = await loadTemplate(context, 'handover-template.md');

  // -------------------------------------------------------------------------
  // HANDOVER_ID — SUBSTITUTED (appears in H1 title and under ## Handover ID)
  // -------------------------------------------------------------------------
  content = content.split('{{HANDOVER_ID}}').join(handoverId);

  // -------------------------------------------------------------------------
  // SESSION_ID — SUBSTITUTED (appears under ## From Session and ## Links)
  // NOTE: We substitute session ID in the From Session section here.
  // The session link and resume probe link are handled in the Links section
  // replacement below.
  // -------------------------------------------------------------------------
  // Replace {{SESSION_ID}} globally — hits From Session + Links session_ID refs.
  content = content.split('{{SESSION_ID}}').join(sessionId);

  // -------------------------------------------------------------------------
  // {{YYYY-MM-DDTHH:MM:SSZ}} — SUBSTITUTED (Generated At)
  //
  // The template uses the same placeholder string in TWO locations:
  //   1. "Generated At" near the top of the document → real generation timestamp
  //   2. "Last validated at" inside Last Validation Result → should be gap marker,
  //      because a freshly-generated handover has not been validated yet.
  //
  // Strategy: do the global substitution first (fills both with the timestamp),
  // then in the Last Validation Result section below, overwrite the specific
  // "Last validated at" line with the gap marker. This keeps the substitution
  // simple while ensuring semantic correctness.
  // -------------------------------------------------------------------------
  content = content.split('{{YYYY-MM-DDTHH:MM:SSZ}}').join(generatedAt);

  // -------------------------------------------------------------------------
  // Risk Assessment table — RENDERED or GAP_MARKER
  // -------------------------------------------------------------------------
  let dimensionRows: DimensionRow[];
  let overallLevelText: string;

  if (refs.latestRiskFile) {
    const riskUri = vscode.Uri.joinPath(witnessRoot, 'sessions', refs.latestRiskFile);
    const riskText = await safeReadFile(riskUri);

    if (riskText) {
      dimensionRows = parseRiskDimensionRows(riskText);
      const parsedOverall = parseOverallLevel(riskText);
      overallLevelText = parsedOverall ?? '(overall level not found in risk file)';
    } else {
      dimensionRows = LOCKED_DIMENSIONS.map(dim => ({
        dimension: dim,
        level: '(no assessment)',
        rationale: '(run Witness: Assess Continuity Risk)',
      }));
      overallLevelText = '(no risk assessment recorded yet — run Witness: Assess Continuity Risk)';
    }
  } else {
    dimensionRows = LOCKED_DIMENSIONS.map(dim => ({
      dimension: dim,
      level: '(no assessment)',
      rationale: '(run Witness: Assess Continuity Risk)',
    }));
    overallLevelText = '(no risk assessment recorded yet — run Witness: Assess Continuity Risk)';
  }

  // Replace the five risk table rows. The template has one row per dimension
  // in canonical order with placeholders {{GREEN/YELLOW/ORANGE/RED/BLOCKED}}
  // and {{one-line rationale}}.
  // Strategy: rebuild the entire table block including header and separator,
  // then replace the original table block in the content.

  const renderedTableRows = dimensionRows.map(
    row => `| ${row.dimension} | ${row.level} | ${row.rationale} |`
  );

  const originalTableHeader = '| Dimension | Level | Rationale |';
  const originalTableSep = '|-----------|-------|-----------|';

  // We need to replace the header + separator + 5 rows as a single block.
  // Build the original block as it appears in the template (after session/handover
  // substitutions that don't touch this area).
  const originalTableBlock = [
    originalTableHeader,
    originalTableSep,
    '| Active Context Pressure | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |',
    '| Artifact Externalization Gap | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |',
    '| Subagent Boundary Risk | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |',
    '| Quality Drift | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |',
    '| Phase Boundary Risk | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |',
  ].join('\n');

  const renderedTableBlock = [
    originalTableHeader,
    originalTableSep,
    ...renderedTableRows,
  ].join('\n');

  content = content.replace(originalTableBlock, renderedTableBlock);

  // -------------------------------------------------------------------------
  // Recommended Risk Level — RENDERED or GAP_MARKER
  // -------------------------------------------------------------------------
  // Template: **{{GREEN / YELLOW / ORANGE / RED / BLOCKED}}**
  content = content.split('**{{GREEN / YELLOW / ORANGE / RED / BLOCKED}}**').join(
    refs.latestRiskFile
      ? `**${overallLevelText}**`
      : `**${overallLevelText}**`
  );

  // -------------------------------------------------------------------------
  // {{RISK_LEVEL_EXPLANATION}} — GAP_MARKER
  // -------------------------------------------------------------------------
  content = content.split('{{RISK_LEVEL_EXPLANATION}}').join(
    '(no risk level explanation recorded yet — fill in manually or run Witness: Assess Continuity Risk)'
  );

  // -------------------------------------------------------------------------
  // Project Snapshot fields — RENDERED (redirect to current-state.md) or GAP_MARKER
  // The spec says: replace the body with a redirect paragraph, keeping the
  // section heading. We replace the individual placeholder fields together.
  // -------------------------------------------------------------------------
  if (refs.currentStateExists) {
    const projectSnapshotBlock = [
      '**Project**: {{PROJECT_NAME}}',
      '',
      '**Current phase**: {{CURRENT_PHASE}}',
      '',
      '**Active slice / feature**: {{ACTIVE_SLICE_OR_FEATURE}}',
      '',
      '**Key constraints in effect**:',
      '- {{CONSTRAINT_1}}',
      '- {{CONSTRAINT_2}}',
    ].join('\n');

    const projectSnapshotReplacement = [
      'See `.witness/current-state.md` for the canonical project snapshot. The fields below are',
      'intentionally not duplicated here to avoid drift — read the source.',
    ].join('\n');

    content = content.replace(projectSnapshotBlock, projectSnapshotReplacement);
  } else {
    // Fallback: replace each field individually with a gap marker.
    content = content.split('{{PROJECT_NAME}}').join(
      '(current-state.md missing — re-run Witness: Initialize Project)'
    );
    content = content.split('{{CURRENT_PHASE}}').join(
      '(current-state.md missing — re-run Witness: Initialize Project)'
    );
    content = content.split('{{ACTIVE_SLICE_OR_FEATURE}}').join(
      '(current-state.md missing — re-run Witness: Initialize Project)'
    );
    content = content.split('{{CONSTRAINT_1}}').join(
      '(current-state.md missing — re-run Witness: Initialize Project)'
    );
    content = content.split('{{CONSTRAINT_2}}').join(
      '(current-state.md missing — re-run Witness: Initialize Project)'
    );
  }

  // -------------------------------------------------------------------------
  // Files In Flight — RENDERED from observation or GAP_MARKER
  // Replace the entire table content (header + row) in the Files In Flight section.
  // -------------------------------------------------------------------------
  const originalFilesTable = [
    '| File | State | What The Fresh Session Needs To Know |',
    '|------|-------|--------------------------------------|',
    '| {{FILE_PATH}} | {{mid-edit / partially applied / review-needed}} | {{specific note}} |',
  ].join('\n');

  let filesTableReplacement: string;

  if (refs.latestObservationFile) {
    const obsUri = vscode.Uri.joinPath(witnessRoot, 'sessions', refs.latestObservationFile);
    const obsText = await safeReadFile(obsUri);

    if (obsText) {
      const dirtyFiles = parseDirtyFiles(obsText);

      if (dirtyFiles.length > 0) {
        const tableRows = dirtyFiles.map(fp =>
          `| ${fp} | dirty | (review before modifying) |`
        );
        filesTableReplacement = [
          '| File | State | What The Fresh Session Needs To Know |',
          '|------|-------|--------------------------------------|',
          ...tableRows,
        ].join('\n');
      } else {
        filesTableReplacement = 'None — all files are in a consistent state.';
      }
    } else {
      filesTableReplacement = '(no observation recorded — run Witness: Observe Workspace)';
    }
  } else {
    filesTableReplacement = '(no observation recorded — run Witness: Observe Workspace)';
  }

  content = content.replace(originalFilesTable, filesTableReplacement);

  // -------------------------------------------------------------------------
  // Pending Decisions — GAP_MARKER (no structured source in v0.1)
  // Replace the entire table content (header + separator + row).
  // -------------------------------------------------------------------------
  const originalDecisionsTable = [
    '| Decision | Context | Urgency |',
    '|----------|---------|---------|',
    '| {{DECISION}} | {{why it is unresolved}} | {{high / medium / low}} |',
  ].join('\n');

  content = content.replace(
    originalDecisionsTable,
    '(none recorded — edit this section manually if there are pending decisions)'
  );

  // -------------------------------------------------------------------------
  // Last Validation Result — GAP_MARKER (not tracked in v0.1)
  // -------------------------------------------------------------------------
  content = content.split('{{unit tests / integration tests / build / lint / none}}').join(
    '(not tracked — record manually if validation was run)'
  );
  content = content.split('{{passed / failed / partial / not run}}').join(
    '(not tracked — record manually if validation was run)'
  );
  content = content.split('{{list any failures, or "none"}}').join(
    '(not tracked — record manually if validation was run)'
  );
  // The "Last validated at" line currently shows the generation timestamp
  // (set by the global substitution near the top of this function). For a
  // freshly-generated handover that has not been validated yet, the gap
  // marker is semantically correct. Replace the specific line.
  content = content.replace(
    `**Last validated at**: ${generatedAt}`,
    '**Last validated at**: (not tracked — record manually if validation was run)'
  );

  // -------------------------------------------------------------------------
  // Next Safe Step — MANDATORY (must be human-authored)
  // -------------------------------------------------------------------------
  content = content.split('{{NEXT_SAFE_STEP}}').join(
    '(MANDATORY: fill in before sharing this handover. Describe the single next action a fresh Copilot session should take.)'
  );

  // -------------------------------------------------------------------------
  // What Not To Do — MANDATORY
  // Replace the two prohibited-action placeholder lines.
  // -------------------------------------------------------------------------
  const originalProhibited = [
    '- Do not {{PROHIBITED_ACTION_1}} because {{REASON}}',
    '- Do not {{PROHIBITED_ACTION_2}} because {{REASON}}',
  ].join('\n');

  content = content.replace(
    originalProhibited,
    '(MANDATORY: fill in if there are session-specific prohibitions, otherwise write "No specific prohibitions at this time.")'
  );

  // -------------------------------------------------------------------------
  // Links section — RENDERED from refs
  //
  // At this point {{SESSION_ID}} has already been globally substituted to sessionId,
  // so the links section now contains the literal sessionId instead of the placeholder.
  // We need to replace the template link lines with rendered versions.
  // -------------------------------------------------------------------------

  // ADR links.
  const originalAdrLink = `- [ADR-${sessionId}: ${sessionId}](../decisions/ADR-${sessionId}-${sessionId}.md)`;
  // Actually, the template had {{NNN}}, {{title}}, {{slug}} — after SESSION_ID substitution
  // those remain untouched (they're different placeholders). Let's replace the ADR link block.
  const originalAdrLinkRaw = `- [ADR-{{NNN}}: {{title}}](../decisions/ADR-{{NNN}}-{{slug}}.md)`;

  let adrLinksReplacement: string;
  if (refs.adrFiles.length > 0) {
    adrLinksReplacement = refs.adrFiles.map(filename => {
      const nameWithoutMd = filename.replace(/\.md$/, '');
      return `- [${nameWithoutMd}](../decisions/${filename})`;
    }).join('\n');
  } else {
    adrLinksReplacement = '- (none)';
  }
  content = content.replace(originalAdrLinkRaw, adrLinksReplacement);

  // Subagent links.
  // Template had: - [{{SUBAGENT_ID}}](../subagents/{{SUBAGENT_ID}}.md)
  // After SESSION_ID substitution, {{SUBAGENT_ID}} is unchanged (it's a different placeholder).
  const originalSubagentLink = `- [{{SUBAGENT_ID}}](../subagents/{{SUBAGENT_ID}}.md)`;

  let subagentLinksReplacement: string;
  if (refs.subagentFiles.length > 0) {
    subagentLinksReplacement = refs.subagentFiles.map(filename => {
      const nameWithoutMd = filename.replace(/\.md$/, '');
      return `- [${nameWithoutMd}](../subagents/${filename})`;
    }).join('\n');
  } else {
    subagentLinksReplacement = '- (none)';
  }
  content = content.replace(originalSubagentLink, subagentLinksReplacement);

  // Session record link.
  // Template had: - [{{SESSION_ID}}](../sessions/{{SESSION_FILE}}.md)
  // After SESSION_ID substitution: - [<sessionId>](../sessions/{{SESSION_FILE}}.md)
  // Replace {{SESSION_FILE}} with sessionId.
  content = content.split('{{SESSION_FILE}}').join(sessionId);

  // Resume probe link.
  // Template had: - [resume-probe-{{SESSION_ID}}](../evaluation/resume-probe-{{SESSION_ID}}.md)
  // After SESSION_ID substitution: - [resume-probe-<sessionId>](../evaluation/resume-probe-<sessionId>.md)
  // That's now correct — no further substitution needed. But replace with gap marker per spec.
  const resumeProbeRendered = `- [resume-probe-${sessionId}](../evaluation/resume-probe-${sessionId}.md)`;
  content = content.replace(
    resumeProbeRendered,
    '- (create with Witness: Create Resume Probe)'
  );

  // -------------------------------------------------------------------------
  // Append Source Artifacts footer.
  // -------------------------------------------------------------------------
  const sourceArtifactsFooter = [
    '',
    '---',
    '',
    '## Source Artifacts',
    '',
    `- Latest risk assessment: \`${refs.latestRiskFile ?? '(none)'}\``,
    `- Latest observation: \`${refs.latestObservationFile ?? '(none)'}\``,
    `- Latest context pressure: \`${refs.latestContextPressureFile ?? '(none)'}\``,
    `- ADRs scanned: ${refs.adrFiles.length}`,
    `- Subagent reports scanned: ${refs.subagentFiles.length}`,
    `- Generated by: Witness: Generate Handover`,
  ].join('\n');

  content = content + sourceArtifactsFooter;

  return content;
}
