// ---------------------------------------------------------------------------
// validateArtifactMaintenance.ts — Witness: Validate Artifact Maintenance (v6.5)
// ---------------------------------------------------------------------------
//
// Validates that a recent agent-assisted artifact-maintenance task stayed
// inside the `.witness/` boundary and produced the required artifact structure.
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
// Changed-file detection strategy (v6.5):
//   1. Try `observeGit` — use `dirtyFilePaths` if available.
//   2. Offer QuickPick: use git-detected files or enter paths manually.
//   3. If manual: InputBox, one path per line or comma-separated.
//
// v6.5: Initial implementation.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot } from '../core/witnessPaths';
import { observeGit } from '../core/gitObserver';
import {
  validateArtifactMaintenance,
  ArtifactMaintenanceValidationInput,
} from '../core/artifactMaintenanceValidator';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';

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
// Changed-file source QuickPick items
// ---------------------------------------------------------------------------

interface FileSourcePickItem extends vscode.QuickPickItem {
  source: "git" | "manual";
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
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Validate Artifact Maintenance` command (v6.5).
 *
 * Gathers changed files (from git or manual input), reads `.witness/` artifact
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
    // 2. Obtain changed file paths — from git or manual input.
    // -------------------------------------------------------------------------

    let changedFiles: string[] = [];

    // Try git observation.
    const gitObs = await observeGit(workspaceRoot);
    const gitDirtyPaths =
      gitObs.available && gitObs.primary
        ? gitObs.primary.dirtyFilePaths
        : [];

    if (gitDirtyPaths.length > 0) {
      // Offer choice: use git-detected files or enter manually.
      const sourceItems: FileSourcePickItem[] = [
        {
          label: `Use git-detected changes (${gitDirtyPaths.length} file${gitDirtyPaths.length === 1 ? "" : "s"})`,
          description: gitDirtyPaths.slice(0, 5).join(", ") +
            (gitDirtyPaths.length > 5 ? `, +${gitDirtyPaths.length - 5} more` : ""),
          source: "git",
        },
        {
          label: "Enter file paths manually",
          description: "Paste file paths — one per line or comma-separated",
          source: "manual",
        },
      ];

      const sourcePick = await vscode.window.showQuickPick(sourceItems, {
        title: "Witness: Validate Artifact Maintenance — Changed Files",
        placeHolder: "How should Witness get the list of changed files?",
      });

      if (!sourcePick) {
        cancelledAt = "file-source-selection";
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

      if (sourcePick.source === "git") {
        changedFiles = gitDirtyPaths;
      } else {
        const manualPaths = await getManualFilePaths();
        if (manualPaths === null) {
          cancelledAt = "manual-path-input";
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
        changedFiles = manualPaths;
      }
    } else {
      // Git unavailable or no dirty files — go straight to manual input.
      const reason = !gitObs.available
        ? "git is not available"
        : "no dirty files detected by git";
      vscode.window.showInformationMessage(
        `Witness: ${reason.charAt(0).toUpperCase() + reason.slice(1)}. Please enter the changed file paths manually.`
      );
      const manualResult = await getManualFilePaths();
      if (manualResult === null) {
        cancelledAt = "manual-path-input";
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
      changedFiles = manualResult;
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
        "Witness: Validation failed. Non-.witness files were modified. Review the report."
      );
    } else if (result.status === "warning") {
      vscode.window.showWarningMessage(
        "Witness: Validation warning. Review the report before approving the artifact."
      );
    } else {
      vscode.window.showInformationMessage(
        "Witness: Validation passed. Review the artifact and approve if satisfied."
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
