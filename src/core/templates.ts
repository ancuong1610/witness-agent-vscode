import * as vscode from 'vscode';
import * as path from 'path';
import { readFile } from './artifactWriter';

/**
 * The template files that are copied into `.witness/templates/` during
 * initialization. These files live in `src/templates/` in the source tree and
 * are shipped inside the .vsix (they are NOT excluded by .vscodeignore).
 *
 * The first six entries are the original v1 templates. The next five are the
 * v2.3 Subagent Ledger stage templates. The last entry is the v2.5 session
 * context packet template.
 */
export const TEMPLATE_FILES = [
  // v1 templates (unchanged)
  'session-template.md',
  'context-pressure-template.md',
  'subagent-report-template.md',
  'adr-template.md',
  'handover-template.md',
  'resume-probe-template.md',
  // v2.3 Subagent Ledger stage templates
  'subagent-contract-template.md',
  'subagent-context-packet-template.md',
  'subagent-evidence-template.md',
  'subagent-completion-report-template.md',
  'subagent-review-template.md',
  // v2.5 Session context packet template
  'context-packet-template.md',
] as const;

/**
 * The four top-level documents copied directly into `.witness/` during
 * initialization.
 */
export const ROOT_DOC_FILES = [
  'constitution.md',
  'index.md',
  'current-state.md',
  'commands.md',
] as const;

/**
 * The top-level agent entry point copied directly into `.witness/` during
 * initialization (v4.6 Agent Harness Pack).
 */
export const AGENTS_ROOT_FILE = 'AGENTS.md';

/**
 * The agent harness protocol files copied into `.witness/harness/` during
 * initialization. These files live under `src/templates/harness/` in the
 * source tree.
 *
 * v4.6: agent-resume.md, subagent-task.md, continuity-issue.md, session-switch.md
 * v4.7: orchestrator.md (Generic Orchestrator Harness Guide)
 * v6.3: current-state.md, checkpoint.md, handover.md, resume.md,
 *        subagent-review.md (strict artifact-maintenance contracts)
 */
export const HARNESS_TEMPLATE_FILES = [
  // v4.6 / v4.7 — agent role and orchestration protocols
  'agent-resume.md',
  'subagent-task.md',
  'continuity-issue.md',
  'session-switch.md',
  'orchestrator.md',
  // v6.3 — strict artifact-maintenance contracts
  'current-state.md',
  'checkpoint.md',
  'handover.md',
  'resume.md',
  'subagent-review.md',
] as const;

/**
 * Reads a bundled template file from the extension's `src/templates/`
 * directory and returns its contents as a string.
 *
 * At runtime the compiled extension lives in `out/`, but the markdown
 * templates ship as-is from `src/templates/` and are accessed via
 * `context.extensionPath`.
 *
 * @param context - The extension context supplied by VS Code on activation.
 * @param filename - The filename to load (e.g. `'handover-template.md'`).
 */
export async function loadTemplate(
  context: vscode.ExtensionContext,
  filename: string
): Promise<string> {
  const templatePath = path.join(context.extensionPath, 'src', 'templates', filename);
  const uri = vscode.Uri.file(templatePath);
  return readFile(uri);
}

/**
 * Reads a bundled harness template file from the extension's
 * `src/templates/harness/` directory and returns its contents as a string.
 *
 * Used by `Witness: Initialize Project` to populate `.witness/harness/`
 * (v4.6 Agent Harness Pack).
 *
 * @param context - The extension context supplied by VS Code on activation.
 * @param filename - The filename to load (e.g. `'agent-resume.md'`).
 */
export async function loadHarnessTemplate(
  context: vscode.ExtensionContext,
  filename: string
): Promise<string> {
  const templatePath = path.join(
    context.extensionPath, 'src', 'templates', 'harness', filename
  );
  const uri = vscode.Uri.file(templatePath);
  return readFile(uri);
}
