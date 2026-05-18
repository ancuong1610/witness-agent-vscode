import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// handoverValidator.ts — pure validation module
// No command logic. No user prompts. No VS Code UI calls.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Severity of a validation issue. */
export type ValidationSeverity = 'ERROR' | 'WARNING';

/**
 * A single validation finding within a handover document.
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  category: 'placeholder' | 'vocabulary' | 'broken-link' | 'missing-section' | 'mandatory-field';
  message: string;
  /** Optional location hint, e.g. line number or section name. */
  location?: string;
}

/**
 * The full result of validating a handover document.
 */
export interface ValidationResult {
  /** True iff there are zero ERROR-severity issues. */
  passed: boolean;
  issues: ValidationIssue[];
  handoverPath: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The five LOCKED risk dimension labels (canonical, from riskEngine.ts).
 * The validator checks for these by exact string match.
 */
const LOCKED_DIMENSION_LABELS = [
  'Active Context Pressure',
  'Artifact Externalization Gap',
  'Subagent Boundary Risk',
  'Quality Drift',
  'Phase Boundary Risk',
] as const;

/**
 * OLD / BANNED dimension names that must NOT appear in handover content or
 * template files. Their presence indicates drift from the locked vocabulary.
 * The validator flags these as vocabulary errors.
 */
const BANNED_DIMENSION_LABELS = [
  'Context Rot',
  'Task Complexity',
  'Validation Gap',
  'Handover Completeness',
] as const;

/**
 * The five locked risk level tokens (from riskEngine.ts).
 */
const VALID_RISK_LEVELS = new Set([
  'GREEN',
  'YELLOW',
  'ORANGE',
  'RED',
  'BLOCKED',
]);

/**
 * H2 headings that MUST be present in a valid handover document.
 * Match is case-sensitive.
 */
const REQUIRED_HEADINGS = [
  '## Handover ID',
  '## From Session',
  '## Generated At',
  '## Files In Flight',
  '## Next Safe Step For Fresh Session',
  '## What Not To Do',
] as const;

/**
 * The Risk Assessment heading is accepted in either form (the template uses the
 * longer form; older handovers may use the shorter form).
 */
const RISK_ASSESSMENT_HEADINGS = [
  '## Risk Assessment',
  '## Risk Assessment At Time Of Handover',
] as const;

const RECOMMENDED_RISK_LEVEL_HEADING = '## Recommended Risk Level';

/**
 * Substrings in the handover content that indicate unfilled mandatory fields.
 * These are the exact gap markers written by generateHandoverContent.
 */
const MANDATORY_FIELD_MARKERS = [
  '(MANDATORY:',
  '(no risk assessment recorded yet',
  '(no observation recorded',
] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the 1-based line number for a given character offset in `content`.
 * Used for location hints in validation issues.
 */
function lineNumberFor(content: string, offset: number): number {
  const before = content.slice(0, offset);
  return (before.match(/\n/g) ?? []).length + 1;
}

/**
 * Checks whether a file exists at the given URI.
 * Returns true if the file exists and is a regular file; false otherwise.
 */
async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type === vscode.FileType.File;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API — validateHandover
// ---------------------------------------------------------------------------

/**
 * Runs all validation rules against a handover document's content.
 *
 * Validation rules:
 *
 * 1. Unfilled {{...}} placeholders → ERROR, category: placeholder
 * 2. Required dimension labels present; banned labels absent → ERROR, category: vocabulary
 * 3. Risk level token vocabulary in table and recommended level → WARNING, category: vocabulary
 * 4. Broken ADR links (../decisions/<filename>) → ERROR, category: broken-link
 * 5. Broken subagent links (../subagents/<filename>) → ERROR, category: broken-link
 * 6. Broken session link (../sessions/<filename>) → ERROR, category: broken-link
 * 7. Missing required H2 sections → ERROR, category: missing-section
 * 8. Mandatory-field gap markers still present → ERROR, category: mandatory-field
 *
 * @param handoverContent - Full text of the handover markdown file.
 * @param handoverPath    - Filesystem path of the handover (for the result record).
 * @param witnessRoot     - URI of `.witness/` for resolving relative links.
 */
export async function validateHandover(
  handoverContent: string,
  handoverPath: string,
  witnessRoot: vscode.Uri
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // -------------------------------------------------------------------------
  // Rule 1: Unfilled {{...}} placeholders
  // -------------------------------------------------------------------------
  const placeholderRegex = /\{\{[^}]+\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = placeholderRegex.exec(handoverContent)) !== null) {
    const lineNo = lineNumberFor(handoverContent, match.index);
    issues.push({
      severity: 'ERROR',
      category: 'placeholder',
      message: `Unfilled template placeholder: ${match[0]}`,
      location: `line ${lineNo}`,
    });
  }

  // -------------------------------------------------------------------------
  // Rule 2: Risk dimension vocabulary
  // -------------------------------------------------------------------------

  // 2a. All five locked dimension labels must appear in the content.
  for (const dim of LOCKED_DIMENSION_LABELS) {
    if (!handoverContent.includes(dim)) {
      issues.push({
        severity: 'ERROR',
        category: 'vocabulary',
        message: `Required risk dimension label missing from handover: "${dim}"`,
        location: 'Risk Assessment section',
      });
    }
  }

  // 2b. No banned (old/wrong) dimension label must appear.
  for (const banned of BANNED_DIMENSION_LABELS) {
    if (handoverContent.includes(banned)) {
      issues.push({
        severity: 'ERROR',
        category: 'vocabulary',
        message: `Banned (outdated) risk dimension label found: "${banned}". Use the locked vocabulary.`,
        location: 'Risk Assessment section',
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rule 3: Risk level token vocabulary
  // Look for tokens that appear to be risk levels (uppercase words 3–7 chars)
  // in the risk table rows and Recommended Risk Level section.
  // -------------------------------------------------------------------------
  const riskTableRegex =
    /^\|\s*(?:Active Context Pressure|Artifact Externalization Gap|Subagent Boundary Risk|Quality Drift|Phase Boundary Risk)\s*\|\s*([A-Z][A-Z0-9]*)\s*\|/gm;

  while ((match = riskTableRegex.exec(handoverContent)) !== null) {
    const token = match[1];
    // Skip gap markers (start with "(").
    if (token.startsWith('(')) {
      continue;
    }
    if (!VALID_RISK_LEVELS.has(token)) {
      const lineNo = lineNumberFor(handoverContent, match.index);
      issues.push({
        severity: 'WARNING',
        category: 'vocabulary',
        message: `Unrecognized risk level token "${token}" in Risk Assessment table. Valid: GREEN, YELLOW, ORANGE, RED, BLOCKED.`,
        location: `line ${lineNo}`,
      });
    }
  }

  // Check Recommended Risk Level section for a bold level token.
  const recommendedSection = handoverContent.match(
    /## Recommended Risk Level\n+\*\*([A-Z][A-Z0-9]*)\*\*/
  );
  if (recommendedSection) {
    const token = recommendedSection[1];
    if (!VALID_RISK_LEVELS.has(token) && !token.startsWith('(')) {
      issues.push({
        severity: 'WARNING',
        category: 'vocabulary',
        message: `Unrecognized risk level token "${token}" in Recommended Risk Level. Valid: GREEN, YELLOW, ORANGE, RED, BLOCKED.`,
        location: 'Recommended Risk Level section',
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rule 4: Broken ADR links
  // Match markdown links of the form [label](../decisions/<filename>)
  // -------------------------------------------------------------------------
  const adrLinkRegex = /\[([^\]]+)\]\(\.\.\/decisions\/([^)]+)\)/g;
  while ((match = adrLinkRegex.exec(handoverContent)) !== null) {
    const filename = match[2];
    const fileUri = vscode.Uri.joinPath(witnessRoot, 'decisions', filename);
    const exists = await fileExists(fileUri);
    if (!exists) {
      const lineNo = lineNumberFor(handoverContent, match.index);
      issues.push({
        severity: 'ERROR',
        category: 'broken-link',
        message: `Broken ADR link: "../decisions/${filename}" does not exist.`,
        location: `line ${lineNo}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rule 5: Broken subagent links
  // Match markdown links of the form [label](../subagents/<filename>)
  // -------------------------------------------------------------------------
  const subagentLinkRegex = /\[([^\]]+)\]\(\.\.\/subagents\/([^)]+)\)/g;
  while ((match = subagentLinkRegex.exec(handoverContent)) !== null) {
    const filename = match[2];
    const fileUri = vscode.Uri.joinPath(witnessRoot, 'subagents', filename);
    const exists = await fileExists(fileUri);
    if (!exists) {
      const lineNo = lineNumberFor(handoverContent, match.index);
      issues.push({
        severity: 'ERROR',
        category: 'broken-link',
        message: `Broken subagent link: "../subagents/${filename}" does not exist.`,
        location: `line ${lineNo}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rule 6: Broken session link
  // Match markdown links of the form [label](../sessions/<filename>)
  // -------------------------------------------------------------------------
  const sessionLinkRegex = /\[([^\]]+)\]\(\.\.\/sessions\/([^)]+)\)/g;
  while ((match = sessionLinkRegex.exec(handoverContent)) !== null) {
    const filename = match[2];
    const fileUri = vscode.Uri.joinPath(witnessRoot, 'sessions', filename);
    const exists = await fileExists(fileUri);
    if (!exists) {
      const lineNo = lineNumberFor(handoverContent, match.index);
      issues.push({
        severity: 'ERROR',
        category: 'broken-link',
        message: `Broken session link: "../sessions/${filename}" does not exist.`,
        location: `line ${lineNo}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rule 7: Missing required H2 sections
  // -------------------------------------------------------------------------
  for (const heading of REQUIRED_HEADINGS) {
    if (!handoverContent.includes(heading)) {
      issues.push({
        severity: 'ERROR',
        category: 'missing-section',
        message: `Required section missing: "${heading}"`,
        location: 'document structure',
      });
    }
  }

  // Risk Assessment heading — accept either form.
  const hasRiskAssessmentHeading = RISK_ASSESSMENT_HEADINGS.some(h =>
    handoverContent.includes(h)
  );
  if (!hasRiskAssessmentHeading) {
    issues.push({
      severity: 'ERROR',
      category: 'missing-section',
      message: `Required section missing: "## Risk Assessment" (or "## Risk Assessment At Time Of Handover")`,
      location: 'document structure',
    });
  }

  // Recommended Risk Level heading.
  if (!handoverContent.includes(RECOMMENDED_RISK_LEVEL_HEADING)) {
    issues.push({
      severity: 'ERROR',
      category: 'missing-section',
      message: `Required section missing: "${RECOMMENDED_RISK_LEVEL_HEADING}"`,
      location: 'document structure',
    });
  }

  // -------------------------------------------------------------------------
  // Rule 8: Mandatory-field gap markers still present
  // -------------------------------------------------------------------------
  for (const marker of MANDATORY_FIELD_MARKERS) {
    let searchOffset = 0;
    while (true) {
      const idx = handoverContent.indexOf(marker, searchOffset);
      if (idx === -1) {
        break;
      }
      const lineNo = lineNumberFor(handoverContent, idx);
      issues.push({
        severity: 'ERROR',
        category: 'mandatory-field',
        message: `Unfilled mandatory field marker found: "${marker}..."`,
        location: `line ${lineNo}`,
      });
      searchOffset = idx + marker.length;
    }
  }

  // -------------------------------------------------------------------------
  // Compute result
  // -------------------------------------------------------------------------
  const passed = issues.every(issue => issue.severity !== 'ERROR');

  return { passed, issues, handoverPath };
}
