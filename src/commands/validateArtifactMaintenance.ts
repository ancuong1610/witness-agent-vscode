// ---------------------------------------------------------------------------
// validateArtifactMaintenance.ts — Witness: Check Memory Update / Validate Artifact Maintenance (v9.6)
// ---------------------------------------------------------------------------
//
// Validates existing `.witness/` changes from a recent agent-assisted
// artifact-maintenance task. This command checks memory updates; it does not
// update project memory itself.
//
// Design invariants:
//   - Does NOT call any LLM.
//   - Does NOT write to `.witness/` or any source file.
//   - Does NOT automatically approve generated artifacts.
//   - Does NOT read source files.
//   - Does NOT read raw telemetry by default.
//   - Only reads `.witness/` markdown files for section validation.
//   - Orchestration only: gather inputs → validate (pure) → report → telemetry.
//   - No webview. No direct provider API. No automatic context injection.
//
// Changed-file detection strategy (v9.8.1):
//   1. Recommend current-state, active session, latest checkpoint/snapshot,
//      recent Witness markdown, and dirty Witness markdown files.
//   2. Let the developer choose the recommended group or a narrower group.
//   3. Keep manual path input as an advanced fallback.
//
// v6.5: Initial implementation.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { getCurrentSessionId } from '../core/sessionRegistry';
import { observeGit } from '../core/gitObserver';
import {
  validateArtifactMaintenance,
  ArtifactMaintenanceValidationInput,
} from '../core/artifactMaintenanceValidator';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';
import { refreshWitnessStatusBar } from '../core/statusBar';

// ---------------------------------------------------------------------------
// Maintenance kind QuickPick items
// ---------------------------------------------------------------------------

// `maintenanceKind` is used instead of `kind` to avoid colliding with
// `vscode.QuickPickItem.kind` (which is typed as `QuickPickItemKind | undefined`).
interface KindPickItem extends vscode.QuickPickItem {
  maintenanceKind:
    | "update-current-state"
    | "create-checkpoint"
    | "prepare-handover"
    | "review-subagent-artifacts"
    | "resume-with-witness"
    | null;
}

const KIND_PICK_ITEMS: KindPickItem[] = [
  {
    label: "Update current-state",
    description: "Agent updated .witness/current-state.md",
    maintenanceKind: "update-current-state",
  },
  {
    label: "Create checkpoint",
    description: "Agent created a checkpoint file",
    maintenanceKind: "create-checkpoint",
  },
  {
    label: "Prepare handover",
    description: "Agent prepared a handover document",
    maintenanceKind: "prepare-handover",
  },
  {
    label: "Review subagent artifacts",
    description: "Agent drafted a subagent review",
    maintenanceKind: "review-subagent-artifacts",
  },
  {
    label: "Resume with Witness",
    description: "Agent prepared a resume summary",
    maintenanceKind: "resume-with-witness",
  },
  {
    label: "Skip section validation",
    description: "Only check file boundaries, not required sections",
    maintenanceKind: null,
  },
];

// ---------------------------------------------------------------------------
// Witness file recommendation QuickPick items
// ---------------------------------------------------------------------------

interface FileRecommendationPickItem extends vscode.QuickPickItem {
  source:
    | "recommended"
    | "current-state"
    | "active-session"
    | "latest-checkpoint"
    | "recent-witness"
    | "manual"
    | "cancel";
  filePaths: string[];
}

interface RecentWitnessFile {
  path: string;
  mtime: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a raw user input string of file paths into an array of trimmed,
 * non-empty path strings. Accepts newline-separated or comma-separated lists.
 */
function parseManualPaths(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

async function selectFilesToValidate(
  workspaceRoot: vscode.Uri
): Promise<string[] | null> {
  const candidates = await buildWitnessFileRecommendations(workspaceRoot);

  if (candidates.length === 0) {
    return getManualFilePaths();
  }

  const picked = await vscode.window.showQuickPick(
    [
      ...candidates,
      {
        label: "Choose files manually",
        description: "Advanced fallback: paste workspace-relative file paths",
        source: "manual",
        filePaths: [],
      },
      {
        label: "Cancel",
        description: "Do not validate memory updates right now",
        source: "cancel",
        filePaths: [],
      },
    ],
    {
      title: "Witness: Check Memory Update",
      placeHolder: "What should Witness check?",
    }
  );

  if (!picked || picked.source === "cancel") {
    return null;
  }

  if (picked.source === "manual") {
    return getManualFilePaths();
  }

  return picked.filePaths;
}

async function buildWitnessFileRecommendations(
  workspaceRoot: vscode.Uri
): Promise<FileRecommendationPickItem[]> {
  const witnessRoot = getWitnessRoot(workspaceRoot);
  const activeSessionId = await getCurrentSessionId(witnessRoot);
  const currentStatePath = ".witness/current-state.md";
  const activeSessionPath = activeSessionId
    ? `.witness/sessions/${activeSessionId}.md`
    : null;

  const currentStateExists = await pathExists(workspaceRoot, currentStatePath);
  const activeSessionExists = activeSessionPath
    ? await pathExists(workspaceRoot, activeSessionPath)
    : false;
  const latestCheckpointPath = await findLatestCheckpointPath(witnessRoot);
  const recentWitnessPaths = await findRecentWitnessMarkdownPaths(witnessRoot);
  const dirtyWitnessPaths = await findDirtyWitnessPaths(workspaceRoot);

  const recentCombined = uniquePaths([
    ...dirtyWitnessPaths,
    ...recentWitnessPaths,
  ]).slice(0, 8);

  const recommendedPaths = activeSessionExists
    ? uniquePaths([currentStatePath, activeSessionPath].filter(isString))
    : uniquePaths([
        ...(currentStateExists ? [currentStatePath] : []),
        ...recentCombined.slice(0, 4),
      ]);

  const items: FileRecommendationPickItem[] = [];

  if (recommendedPaths.length > 0) {
    items.push({
      label: activeSessionExists
        ? "Recommended: Current state + active session"
        : "Recommended: Current state + recent Witness files",
      description: summarizePaths(recommendedPaths),
      source: "recommended",
      filePaths: recommendedPaths,
    });
  }

  if (currentStateExists) {
    items.push({
      label: "Current state only",
      description: currentStatePath,
      source: "current-state",
      filePaths: [currentStatePath],
    });
  }

  if (activeSessionExists && activeSessionPath) {
    items.push({
      label: "Active session only",
      description: activeSessionPath,
      source: "active-session",
      filePaths: [activeSessionPath],
    });
  }

  if (latestCheckpointPath) {
    items.push({
      label: "Latest checkpoint/snapshot",
      description: latestCheckpointPath,
      source: "latest-checkpoint",
      filePaths: [latestCheckpointPath],
    });
  }

  if (recentCombined.length > 0) {
    items.push({
      label: "Recent Witness files",
      description: summarizePaths(recentCombined),
      source: "recent-witness",
      filePaths: recentCombined,
    });
  }

  return items;
}

async function findDirtyWitnessPaths(workspaceRoot: vscode.Uri): Promise<string[]> {
  const gitObs = await observeGit(workspaceRoot);
  const dirtyPaths =
    gitObs.available && gitObs.primary
      ? gitObs.primary.dirtyFilePaths
      : [];

  return dirtyPaths.filter((path) =>
    path.startsWith(".witness/") && path.endsWith(".md")
  );
}

async function findLatestCheckpointPath(
  witnessRoot: vscode.Uri
): Promise<string | null> {
  try {
    const checkpointsRoot = vscode.Uri.joinPath(witnessRoot, "checkpoints");
    const entries = await vscode.workspace.fs.readDirectory(checkpointsRoot);
    let latest: RecentWitnessFile | null = null;

    for (const [name, fileType] of entries) {
      if (fileType !== vscode.FileType.File || !name.endsWith(".md")) {
        continue;
      }

      const path = `.witness/checkpoints/${name}`;
      const stat = await vscode.workspace.fs.stat(
        vscode.Uri.joinPath(checkpointsRoot, name)
      );
      if (!latest || stat.mtime > latest.mtime) {
        latest = { path, mtime: stat.mtime };
      }
    }

    return latest?.path ?? null;
  } catch {
    return null;
  }
}

async function findRecentWitnessMarkdownPaths(
  witnessRoot: vscode.Uri
): Promise<string[]> {
  const recent: RecentWitnessFile[] = [];

  await collectRecentWitnessMarkdown(witnessRoot, ".witness", recent);

  return recent
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => entry.path)
    .filter((path) => !path.startsWith(".witness/telemetry/"))
    .slice(0, 8);
}

async function collectRecentWitnessMarkdown(
  dir: vscode.Uri,
  relDir: string,
  out: RecentWitnessFile[]
): Promise<void> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dir);
  } catch {
    return;
  }

  for (const [name, fileType] of entries) {
    const relPath = `${relDir}/${name}`;
    const childUri = vscode.Uri.joinPath(dir, name);

    if (fileType === vscode.FileType.Directory) {
      if (relPath === ".witness/telemetry" || relPath === ".witness/templates") {
        continue;
      }
      await collectRecentWitnessMarkdown(childUri, relPath, out);
      continue;
    }

    if (fileType !== vscode.FileType.File || !relPath.endsWith(".md")) {
      continue;
    }

    try {
      const stat = await vscode.workspace.fs.stat(childUri);
      out.push({ path: relPath, mtime: stat.mtime });
    } catch {
      // Ignore unreadable files.
    }
  }
}

async function pathExists(
  workspaceRoot: vscode.Uri,
  relPath: string
): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceRoot, relPath));
    return true;
  } catch {
    return false;
  }
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

function summarizePaths(paths: string[]): string {
  return paths.slice(0, 3).join(", ") +
    (paths.length > 3 ? `, +${paths.length - 3} more` : "");
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}

/**
 * Read the contents of all `.witness/` markdown files in the given path list.
 * Telemetry files and non-markdown files are skipped.
 * Failures for individual files are silently ignored — missing content means
 * that file is excluded from section validation.
 */
async function readWitnessMarkdownContents(
  workspaceRoot: vscode.Uri,
  witnessPaths: string[]
): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};

  for (const relPath of witnessPaths) {
    // Only read .witness/ markdown files.
    if (!relPath.startsWith(".witness/")) {
      continue;
    }
    // Skip telemetry directory.
    if (relPath.startsWith(".witness/telemetry/")) {
      continue;
    }
    // Only markdown.
    if (!relPath.endsWith(".md")) {
      continue;
    }

    try {
      const fileUri = vscode.Uri.joinPath(workspaceRoot, relPath);
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      contents[relPath] = Buffer.from(bytes).toString("utf-8");
    } catch {
      // File not readable — skip; validator will note missing content.
    }
  }

  return contents;
}

/**
 * Build a markdown validation report string from the validation result.
 */
function buildValidationReport(
  result: ReturnType<typeof validateArtifactMaintenance>,
  expectedKind: string | null
): string {
  const statusLine =
    result.status === "passed"
      ? "Status: PASSED"
      : result.status === "warning"
      ? "Status: WARNING — review recommended"
      : "Status: FAILED — do not trust artifact update";

  const lines: string[] = [
    "# Witness Artifact Maintenance Validation",
    "",
    "This report validates existing .witness changes. It does not update memory itself.",
    "",
    statusLine,
    "",
    `**Summary:** ${result.summary}`,
    "",
    `**Expected maintenance kind:** ${expectedKind ?? "not specified"}`,
    "",
  ];

  // Changed Witness files
  lines.push("## Changed Witness Files");
  if (result.changedWitnessFiles.length === 0) {
    lines.push("(none detected)");
  } else {
    for (const f of result.changedWitnessFiles) {
      lines.push(`- ${f}`);
    }
  }
  lines.push("");

  // Changed non-Witness files
  lines.push("## Changed Non-Witness Files");
  if (result.changedNonWitnessFiles.length === 0) {
    lines.push("(none — boundary respected)");
  } else {
    for (const f of result.changedNonWitnessFiles) {
      lines.push(`- ${f}`);
    }
    lines.push("");
    lines.push(
      "Artifact-only maintenance touched non-.witness files." +
        " Review these changes before trusting the artifact update."
    );
  }
  lines.push("");

  // Issues
  lines.push("## Issues");
  if (result.issues.length === 0) {
    lines.push("(none)");
  } else {
    for (const issue of result.issues) {
      const prefix = issue.severity.toUpperCase();
      lines.push(`- [${prefix}] ${issue.message}`);
      if (issue.evidence) {
        lines.push(`  Evidence: ${issue.evidence}`);
      }
    }
  }
  lines.push("");

  // Next step
  lines.push("## Next Step");
  if (result.status === "failed") {
    lines.push(
      "Review the non-.witness file changes listed above before accepting any artifact update."
    );
    lines.push(
      "Reject or revert the agent output if source files were modified without your approval."
    );
  } else if (result.status === "warning") {
    lines.push(
      "Review the issues listed above and confirm the artifact meets your expectations."
    );
    lines.push(
      "Address any missing sections or unresolved placeholders before approving."
    );
  } else {
    lines.push(
      "Validation passed. Review the artifact content and approve if it meets your expectations."
    );
    lines.push(
      "Continue coding, run Witness: Save Progress again later, or run Witness: Resume next time."
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Validate Artifact Maintenance` command (v6.5).
 *
 * Gathers changed files from recommended `.witness/` candidates or manual input,
 * reads `.witness/` artifact
 * contents, calls the pure validator, and opens an unsaved markdown validation
 * report for developer review.
 *
 * Emits telemetry event `witness.artifact_maintenance.validated`.
 */
export async function validateArtifactMaintenanceCmd(
  _context: vscode.ExtensionContext
): Promise<void> {
  const elapsed = createCommandTimer();

  // Telemetry state.
  let validationStatus: string = "unknown";
  let issueCount: number = 0;
  let changedWitnessFileCount: number = 0;
  let changedNonWitnessFileCount: number = 0;
  let expectedKindLabel: string = "unknown";
  let completed: boolean = false;
  let cancelledAt: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Require an open workspace folder.
    // -------------------------------------------------------------------------

    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage("Witness: Open a folder first.");
      cancelledAt = "no-workspace";
      await emitWitnessEvent({
        workspaceRoot,
        eventName: "witness.artifact_maintenance.validated",
        commandId: "witness.validateArtifactMaintenance",
        sessionId: null,
        status: "cancelled",
        durationMs: elapsed(),
        attributes: {
          status: validationStatus,
          issue_count: issueCount,
          changed_witness_file_count: changedWitnessFileCount,
          changed_non_witness_file_count: changedNonWitnessFileCount,
          expected_kind: expectedKindLabel,
          completed,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 2. Choose existing `.witness/` files to validate.
    // -------------------------------------------------------------------------

    const changedFiles = await selectFilesToValidate(workspaceRoot);
    if (changedFiles === null) {
      cancelledAt = "file-selection";
      await emitWitnessEvent({
        workspaceRoot,
        eventName: "witness.artifact_maintenance.validated",
        commandId: "witness.validateArtifactMaintenance",
        sessionId: null,
        status: "cancelled",
        durationMs: elapsed(),
        attributes: {
          status: validationStatus,
          issue_count: issueCount,
          changed_witness_file_count: changedWitnessFileCount,
          changed_non_witness_file_count: changedNonWitnessFileCount,
          expected_kind: expectedKindLabel,
          completed,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 3. Ask user for expected maintenance kind.
    // -------------------------------------------------------------------------

    const kindPick = await vscode.window.showQuickPick(KIND_PICK_ITEMS, {
      title: "Witness: Validate Artifact Maintenance — Maintenance Kind",
      placeHolder: "What kind of maintenance did the agent perform?",
    });

    if (!kindPick) {
      cancelledAt = "kind-selection";
      await emitWitnessEvent({
        workspaceRoot,
        eventName: "witness.artifact_maintenance.validated",
        commandId: "witness.validateArtifactMaintenance",
        sessionId: null,
        status: "cancelled",
        durationMs: elapsed(),
        attributes: {
          status: validationStatus,
          issue_count: issueCount,
          changed_witness_file_count: changedWitnessFileCount,
          changed_non_witness_file_count: changedNonWitnessFileCount,
          expected_kind: expectedKindLabel,
          completed,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    expectedKindLabel = kindPick.maintenanceKind ?? "skip";

    // -------------------------------------------------------------------------
    // 4. Read contents of changed .witness/ markdown files.
    //    Only .witness/ files. No source files. No telemetry.
    // -------------------------------------------------------------------------

    const witnessFilePaths = changedFiles.filter((f) =>
      f.startsWith(".witness/")
    );
    const artifactContents = await readWitnessMarkdownContents(
      workspaceRoot,
      witnessFilePaths
    );

    // -------------------------------------------------------------------------
    // 5. Run the pure validator.
    // -------------------------------------------------------------------------

    const validationInput: ArtifactMaintenanceValidationInput = {
      changedFiles,
      expectedKind: kindPick.maintenanceKind,
      artifactContents,
    };

    const result = validateArtifactMaintenance(validationInput);

    // Record counts for telemetry.
    validationStatus = result.status;
    issueCount = result.issues.length;
    changedWitnessFileCount = result.changedWitnessFiles.length;
    changedNonWitnessFileCount = result.changedNonWitnessFiles.length;

    // -------------------------------------------------------------------------
    // 6. Open unsaved markdown validation report.
    // -------------------------------------------------------------------------

    const report = buildValidationReport(result, kindPick.maintenanceKind);

    const doc = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: report,
    });
    await vscode.window.showTextDocument(doc, { preview: false });

    // Show a brief status notification.
    if (result.status === "failed") {
      vscode.window.showErrorMessage(
        "Witness: Check Memory Update failed. Non-.witness files were modified. Review the report."
      );
    } else if (result.status === "warning") {
      vscode.window.showWarningMessage(
        "Witness: Check Memory Update warning. Review the report before approving the artifact."
      );
    } else {
      vscode.window.showInformationMessage(
        "Witness: Check Memory Update passed. Continue coding, run Witness: Save Progress again later, or run Witness: Resume next time."
      );
    }

    // -------------------------------------------------------------------------
    // 7. Emit telemetry.
    // -------------------------------------------------------------------------

    completed = true;
    await emitWitnessEvent({
      workspaceRoot,
      eventName: "witness.artifact_maintenance.validated",
      commandId: "witness.validateArtifactMaintenance",
      sessionId: null,
      status: "success",
      durationMs: elapsed(),
      attributes: {
        status: validationStatus,
        issue_count: issueCount,
        changed_witness_file_count: changedWitnessFileCount,
        changed_non_witness_file_count: changedNonWitnessFileCount,
        expected_kind: expectedKindLabel,
        completed,
        cancelled_at: null,
      },
    });
    await refreshWitnessStatusBar();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: "witness.artifact_maintenance.validated",
      commandId: "witness.validateArtifactMaintenance",
      sessionId: null,
      status: "error",
      durationMs: elapsed(),
      attributes: {
        status: validationStatus,
        issue_count: issueCount,
        changed_witness_file_count: changedWitnessFileCount,
        changed_non_witness_file_count: changedNonWitnessFileCount,
        expected_kind: expectedKindLabel,
        completed: false,
        cancelled_at: cancelledAt ?? "unhandled-error",
      },
    });
    vscode.window.showErrorMessage(
      `Witness: Validate Artifact Maintenance failed — ${message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Manual path input helper
// ---------------------------------------------------------------------------

/**
 * Show an InputBox asking the developer to paste changed file paths.
 * Returns the parsed path array, or null if the user dismissed the InputBox.
 */
async function getManualFilePaths(): Promise<string[] | null> {
  const raw = await vscode.window.showInputBox({
    title: "Witness: Validate Artifact Maintenance — Enter Changed Files",
    prompt:
      "Paste the workspace-relative paths of files changed during the maintenance task.",
    placeHolder:
      ".witness/current-state.md, .witness/checkpoints/2026-05-22-checkpoint.md",
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "Enter at least one file path.";
      }
      return null;
    },
  });

  if (raw === undefined || raw === null) {
    // User pressed Escape.
    return null;
  }

  return parseManualPaths(raw);
}
