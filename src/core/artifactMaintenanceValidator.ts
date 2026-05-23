// ---------------------------------------------------------------------------
// artifactMaintenanceValidator.ts — v6.5 Artifact Maintenance Validator (core)
// ---------------------------------------------------------------------------
//
// Pure validator: given a list of changed file paths and optional artifact
// contents, determines whether an artifact-maintenance task stayed inside the
// `.witness/` boundary and produced the required artifact structure.
//
// Design constraints:
//   - Pure function: input → output, no side effects.
//   - No vscode import.
//   - No filesystem reads or writes.
//   - No telemetry.
//   - No command execution.
//   - Synchronous.
//
// Core principle: LLM may draft. Witness validates. Developer approves.
//
// v6.5: Initial implementation.
//       Rule 1 — file partition + non-witness detection (critical).
//       Rule 2 — empty changed-file list (warning).
//       Rule 3 — required section checks per expectedKind.
//       Rule 4 — mandatory marker / placeholder detection (warning).
//       Rule 5 — summary generation.
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type ArtifactMaintenanceValidationStatus =
  | "passed"
  | "warning"
  | "failed";

export type ArtifactMaintenanceValidationIssueSeverity =
  | "info"
  | "warning"
  | "critical";

export interface ArtifactMaintenanceValidationIssue {
  severity: ArtifactMaintenanceValidationIssueSeverity;
  message: string;
  evidence?: string;
}

/**
 * Input to the artifact maintenance validator.
 *
 * `changedFiles` — workspace-relative paths of all files changed during the
 * artifact-maintenance task. Paths must use forward slashes. Witness files
 * begin with `.witness/`.
 *
 * `expectedKind` — the maintenance kind that was performed. When provided,
 * the validator checks that the relevant artifact contains the required
 * markdown sections. Pass `null` or omit to skip section validation.
 *
 * `artifactContents` — map of workspace-relative path to file content string.
 * Caller supplies the contents of the `.witness/` files it read. The validator
 * does not read files itself.
 */
export interface ArtifactMaintenanceValidationInput {
  changedFiles: string[];
  expectedKind?:
    | "update-current-state"
    | "create-checkpoint"
    | "prepare-handover"
    | "review-subagent-artifacts"
    | "resume-with-witness"
    | null;
  artifactContents?: Record<string, string>;
}

export interface ArtifactMaintenanceValidationResult {
  status: ArtifactMaintenanceValidationStatus;
  issues: ArtifactMaintenanceValidationIssue[];
  changedWitnessFiles: string[];
  changedNonWitnessFiles: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Required sections per kind
// ---------------------------------------------------------------------------

const REQUIRED_SECTIONS: Record<string, string[]> = {
  "update-current-state": [
    "Current Goal",
    "Latest Progress",
    "Open Risks",
    "Next Safe Action",
    "Evidence Used",
    "Uncertainty",
  ],
  "create-checkpoint": [
    "Summary",
    "Evidence",
    "Changed Files",
    "Open Risks",
    "Next Action",
    "Uncertainty",
  ],
  "prepare-handover": [
    "Session Summary",
    "Completed Work",
    "Current State",
    "Open Risks",
    "Next Steps",
    "Resume Instructions",
    "Evidence Used",
    "Uncertainty",
  ],
  "review-subagent-artifacts": [
    "Reviewed Subagent",
    "Evidence Checked",
    "Findings",
    "Integration Risk",
    "Recommended Decision",
    "Uncertainty",
  ],
  "resume-with-witness": [
    "Current Goal",
    "Completed Work",
    "Open Risks",
    "Relevant Artifacts",
    "Next Recommended Action",
    "Questions Before Editing",
  ],
};

// ---------------------------------------------------------------------------
// Mandatory marker patterns
// ---------------------------------------------------------------------------

const MANDATORY_MARKERS = ["TODO", "TBD", "{{", "}}", "[FILL", "<...>"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a markdown content string contains a heading (any level) that
 * includes the given section name. Comparison is case-insensitive.
 */
function hasSectionHeading(content: string, sectionName: string): boolean {
  const lower = sectionName.toLowerCase();
  return content.split("\n").some((line) => {
    const trimmed = line.trim();
    // Match any ATX heading (# through ######)
    if (!/^#{1,6}\s/.test(trimmed)) {
      return false;
    }
    const headingText = trimmed.replace(/^#{1,6}\s+/, "").toLowerCase();
    return headingText.includes(lower);
  });
}

/**
 * Return the worst status between two.
 * failed > warning > passed.
 */
function worseStatus(
  a: ArtifactMaintenanceValidationStatus,
  b: ArtifactMaintenanceValidationStatus
): ArtifactMaintenanceValidationStatus {
  if (a === "failed" || b === "failed") {
    return "failed";
  }
  if (a === "warning" || b === "warning") {
    return "warning";
  }
  return "passed";
}

/**
 * Return true if any artifact content string contains at least one of the
 * known mandatory markers.
 */
function containsMandatoryMarker(content: string): boolean {
  return MANDATORY_MARKERS.some((marker) => content.includes(marker));
}

// ---------------------------------------------------------------------------
// Core export
// ---------------------------------------------------------------------------

/**
 * Validate artifact-only maintenance results.
 *
 * This function is pure: same input always produces the same output.
 * It performs no I/O and has no side effects.
 */
export function validateArtifactMaintenance(
  input: ArtifactMaintenanceValidationInput
): ArtifactMaintenanceValidationResult {
  const { changedFiles, expectedKind, artifactContents } = input;

  const issues: ArtifactMaintenanceValidationIssue[] = [];
  let status: ArtifactMaintenanceValidationStatus = "passed";

  // -------------------------------------------------------------------------
  // Rule 1 — Partition changed files.
  //           Non-.witness/ files → critical failure.
  // -------------------------------------------------------------------------

  const changedWitnessFiles = changedFiles.filter((f) =>
    f.startsWith(".witness/")
  );
  const changedNonWitnessFiles = changedFiles.filter(
    (f) => !f.startsWith(".witness/")
  );

  if (changedNonWitnessFiles.length > 0) {
    status = "failed";
    issues.push({
      severity: "critical",
      message: "Artifact-only maintenance changed non-.witness files.",
      evidence: changedNonWitnessFiles.join(", "),
    });
  }

  // -------------------------------------------------------------------------
  // Rule 2 — Empty changed-file list.
  // -------------------------------------------------------------------------

  if (changedFiles.length === 0) {
    status = worseStatus(status, "warning");
    issues.push({
      severity: "warning",
      message: "No changed files were detected for validation.",
    });
  }

  // -------------------------------------------------------------------------
  // Rule 3 — Required section checks (when expectedKind is provided).
  // -------------------------------------------------------------------------

  if (expectedKind && expectedKind !== null) {
    const requiredSections = REQUIRED_SECTIONS[expectedKind] ?? [];

    if (requiredSections.length > 0) {
      // Find the first witness file in artifactContents that is a markdown file.
      // For section checking we inspect all provided artifact contents.
      const contents = artifactContents ?? {};
      const witnessContentEntries = Object.entries(contents).filter(([path]) =>
        path.startsWith(".witness/")
      );

      if (witnessContentEntries.length === 0 && changedWitnessFiles.length > 0) {
        // Caller changed .witness/ files but did not supply content.
        status = worseStatus(status, "warning");
        issues.push({
          severity: "warning",
          message:
            "Expected artifact content was not provided for section validation.",
          evidence: changedWitnessFiles.join(", "),
        });
      } else if (witnessContentEntries.length > 0) {
        // Merge all provided witness content for section scanning.
        // Each required section must appear in at least one artifact.
        const missingSections: string[] = [];

        for (const section of requiredSections) {
          const foundInAnyArtifact = witnessContentEntries.some(
            ([, content]) => hasSectionHeading(content, section)
          );
          if (!foundInAnyArtifact) {
            missingSections.push(section);
          }
        }

        if (missingSections.length > 0) {
          status = worseStatus(status, "warning");
          issues.push({
            severity: "warning",
            message: `Required sections missing from artifact.`,
            evidence: missingSections.join(", "),
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule 4 — Mandatory marker / placeholder detection.
  // -------------------------------------------------------------------------

  if (artifactContents) {
    const filesWithMarkers: string[] = [];
    for (const [path, content] of Object.entries(artifactContents)) {
      if (path.startsWith(".witness/") && containsMandatoryMarker(content)) {
        filesWithMarkers.push(path);
      }
    }
    if (filesWithMarkers.length > 0) {
      status = worseStatus(status, "warning");
      issues.push({
        severity: "warning",
        message:
          "Artifact contains unresolved placeholder or mandatory marker.",
        evidence: filesWithMarkers.join(", "),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rule 5 — Summary.
  // -------------------------------------------------------------------------

  let summary: string;
  if (status === "failed") {
    summary =
      "Validation failed: non-.witness files were modified during artifact-only maintenance.";
  } else if (status === "warning") {
    summary = "Validation warning: artifact structure needs review.";
  } else {
    summary =
      "Validation passed: only .witness files changed and required sections are present.";
  }

  return {
    status,
    issues,
    changedWitnessFiles,
    changedNonWitnessFiles,
    summary,
  };
}
