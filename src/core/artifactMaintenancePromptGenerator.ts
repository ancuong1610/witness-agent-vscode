// ---------------------------------------------------------------------------
// artifactMaintenancePromptGenerator.ts — v6.2 Artifact Maintenance Prompt Generator
// ---------------------------------------------------------------------------
//
// Generates strict, copy-ready prompts for the active coding agent to draft
// or update `.witness/` artifacts.
//
// Design constraints:
//   - Pure function: params → ArtifactMaintenancePrompt, no side effects.
//   - No filesystem reads or writes.
//   - No VS Code API usage.
//   - No LLM calls.
//   - No telemetry.
//   - Synchronous.
//
// The generated prompt is returned as a plain string. The caller is
// responsible for displaying it (copy-to-clipboard, markdown tab, etc.).
// This module has no opinion about how the prompt reaches the developer's
// coding agent.
//
// Core principle: LLM may draft. Witness validates. Developer approves.
//
// v6.2: Initial implementation. Five prompt kinds:
//   - update-current-state
//   - create-checkpoint
//   - prepare-handover
//   - review-subagent-artifacts
//   - resume-with-witness
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type ArtifactMaintenancePromptKind =
  | "update-current-state"
  | "create-checkpoint"
  | "prepare-handover"
  | "review-subagent-artifacts"
  | "resume-with-witness";

/**
 * Parameters supplied by the caller to generate a maintenance prompt.
 *
 * `kind` selects which prompt template is used.
 * `maintenanceTitle` and `maintenanceReason` come from the trigger engine output
 * and are embedded in the Task section of the prompt.
 * `evidence` is the list of short key: value strings from the trigger engine.
 * `activeSessionId` is included in the Files to read section when present.
 * `taskGoal` is included in the Task section when present.
 */
export interface ArtifactMaintenancePromptParams {
  kind: ArtifactMaintenancePromptKind;
  maintenanceTitle: string;
  maintenanceReason: string;
  evidence: string[];
  activeSessionId?: string | null;
  taskGoal?: string | null;
}

/**
 * A fully generated artifact maintenance prompt.
 *
 * `prompt` is the complete plain-text prompt ready for copy-paste.
 * `allowedWrites` and `forbiddenWrites` mirror the constraint lists embedded
 * in the prompt text, provided as structured arrays for downstream validation.
 * `requiredSections` lists the markdown section headings that the generated
 * artifact must contain; used by the validator in v6.5.
 */
export interface ArtifactMaintenancePrompt {
  kind: ArtifactMaintenancePromptKind;
  title: string;
  prompt: string;
  allowedWrites: string[];
  forbiddenWrites: string[];
  requiredSections: string[];
}

// ---------------------------------------------------------------------------
// Shared forbidden-write categories
// ---------------------------------------------------------------------------

/** Forbidden write targets common to all artifact-maintenance prompts. */
const COMMON_FORBIDDEN_WRITES: string[] = [
  "Application source files (any file outside .witness/)",
  "package.json, tsconfig.json, and other project configuration files",
  "Telemetry files (.witness/telemetry/)",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format the evidence array as a numbered list for inclusion in the prompt.
 * If evidence is empty, returns the required uncertainty notice.
 */
function formatEvidence(evidence: string[]): string {
  if (evidence.length === 0) {
    return "  (none)\n  No explicit evidence was provided. State uncertainty clearly.";
  }
  return evidence.map((e, i) => `  ${i + 1}. ${e}`).join("\n");
}

/**
 * Format a string array as a numbered list, indented by two spaces.
 */
function formatList(items: string[]): string {
  return items.map((item, i) => `  ${i + 1}. ${item}`).join("\n");
}

/**
 * Wrap text in the standard Witness prompt envelope.
 * All prompts share the same opening header and closing footer.
 */
function wrapPrompt(body: string): string {
  return [
    "--- WITNESS ARTIFACT MAINTENANCE PROMPT ---",
    "",
    body.trimEnd(),
    "",
    "--- END OF WITNESS ARTIFACT MAINTENANCE PROMPT ---",
  ].join("\n");
}

/**
 * Build the standard Role section, identical across all prompt kinds.
 */
function buildRoleSection(): string {
  return [
    "ROLE",
    "You are helping maintain Witness project-memory artifacts.",
    "You are operating in artifact-only mode.",
    "You may only write to the files explicitly listed under ALLOWED WRITES.",
    "Do not modify application source code.",
    "Only edit files explicitly listed under Allowed writes.",
    "Do not claim tests passed unless test output exists.",
    "After writing, stop for human review.",
  ].join("\n");
}

/**
 * Build the Task section from the maintenance title, reason, and optional goal.
 */
function buildTaskSection(
  maintenanceTitle: string,
  maintenanceReason: string,
  taskGoal: string | null | undefined
): string {
  const lines = [
    "TASK",
    `Maintenance action: ${maintenanceTitle}`,
    `Reason detected: ${maintenanceReason}`,
  ];
  if (taskGoal) {
    lines.push(`Current task goal: ${taskGoal}`);
  }
  return lines.join("\n");
}

/**
 * Build the Evidence to inspect section.
 */
function buildEvidenceSection(evidence: string[]): string {
  return ["EVIDENCE TO INSPECT", formatEvidence(evidence)].join("\n");
}

/**
 * Build the Allowed writes section from a list of paths/patterns.
 */
function buildAllowedWritesSection(allowed: string[]): string {
  return ["ALLOWED WRITES", formatList(allowed)].join("\n");
}

/**
 * Build the Forbidden writes section from a combined list.
 */
function buildForbiddenWritesSection(forbidden: string[]): string {
  return [
    "FORBIDDEN WRITES",
    formatList(forbidden),
  ].join("\n");
}

/**
 * Build the Required output sections list.
 */
function buildRequiredSectionsSection(sections: string[]): string {
  return [
    "REQUIRED OUTPUT SECTIONS",
    "The artifact you produce must contain all of the following sections,",
    "each as a markdown heading (## or ###):",
    formatList(sections),
  ].join("\n");
}

/**
 * Build the Human review requirement section.
 * Identical for all prompt kinds.
 */
function buildHumanReviewSection(): string {
  return [
    "HUMAN REVIEW REQUIREMENT",
    "Present your draft to the developer and stop.",
    "Do not write any file until the developer explicitly approves.",
    "Do not treat your own output as approved.",
    "If evidence is incomplete or ambiguous, note the uncertainty explicitly",
    "in the artifact rather than inferring a confident state.",
  ].join("\n");
}

/**
 * Build the Stop condition section.
 * Identical for all prompt kinds.
 */
function buildStopConditionSection(): string {
  return [
    "STOP CONDITION",
    "After presenting the artifact draft, stop and wait.",
    "Do not proceed to source-code changes.",
    "Do not open additional files unless the developer asks.",
    "Do not perform any action that has a side effect outside .witness/.",
  ].join("\n");
}

/**
 * Assemble all sections into a complete prompt string, separated by blank lines.
 */
function assembleSections(sections: string[]): string {
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Prompt builders — one per kind
// ---------------------------------------------------------------------------

function buildUpdateCurrentStatePrompt(
  params: ArtifactMaintenancePromptParams
): ArtifactMaintenancePrompt {
  const { maintenanceTitle, maintenanceReason, evidence, activeSessionId, taskGoal } = params;

  const filesToRead: string[] = [
    ".witness/AGENTS.md",
    ".witness/current-state.md",
  ];
  if (activeSessionId) {
    filesToRead.push(`.witness/sessions/${activeSessionId}.md`);
  }
  filesToRead.push(".witness/handovers/latest.md (if present and relevant)");

  const allowedWrites = [".witness/current-state.md"];

  const forbiddenWrites = [
    ...COMMON_FORBIDDEN_WRITES,
    "Previous handover files (.witness/handovers/ except latest.md, which must not be edited here)",
    "Subagent review files (.witness/subagents/) unless explicitly asked by the developer",
  ];

  const requiredSections = [
    "Current Goal",
    "Latest Progress",
    "Open Risks",
    "Next Safe Action",
    "Evidence Used",
    "Uncertainty",
  ];

  const body = assembleSections([
    buildRoleSection(),
    buildTaskSection(maintenanceTitle, maintenanceReason, taskGoal),
    [
      "FILES TO READ",
      "Read the following files before drafting the update.",
      "Do not read files outside this list unless the developer asks.",
      formatList(filesToRead),
    ].join("\n"),
    buildEvidenceSection(evidence),
    buildAllowedWritesSection(allowedWrites),
    buildForbiddenWritesSection(forbiddenWrites),
    buildRequiredSectionsSection(requiredSections),
    buildHumanReviewSection(),
    buildStopConditionSection(),
  ]);

  return {
    kind: "update-current-state",
    title: "Update Project Memory",
    prompt: wrapPrompt(body),
    allowedWrites,
    forbiddenWrites,
    requiredSections,
  };
}

function buildCreateCheckpointPrompt(
  params: ArtifactMaintenancePromptParams
): ArtifactMaintenancePrompt {
  const { maintenanceTitle, maintenanceReason, evidence, activeSessionId, taskGoal } = params;

  const filesToRead: string[] = [
    ".witness/AGENTS.md",
    ".witness/current-state.md",
  ];
  if (activeSessionId) {
    filesToRead.push(`.witness/sessions/${activeSessionId}.md`);
  }
  filesToRead.push(
    "git status / git diff --stat output (if provided by the developer in this session)",
    "Any relevant evidence listed in the EVIDENCE TO INSPECT section below"
  );

  const allowedWrites = [
    ".witness/checkpoints/ (new checkpoint file only)",
    ".witness/current-state.md (only if the developer explicitly requests a current-state update as part of this checkpoint)",
  ];

  const forbiddenWrites = [
    ...COMMON_FORBIDDEN_WRITES,
    "Previous handover files (.witness/handovers/)",
    "Subagent ledger files (.witness/subagents/)",
  ];

  const requiredSections = [
    "Summary",
    "Evidence",
    "Changed Files",
    "Open Risks",
    "Next Action",
    "Uncertainty",
  ];

  const body = assembleSections([
    buildRoleSection(),
    buildTaskSection(maintenanceTitle, maintenanceReason, taskGoal),
    [
      "FILES TO READ",
      "Read the following files before drafting the checkpoint.",
      "Do not read files outside this list unless the developer asks.",
      formatList(filesToRead),
    ].join("\n"),
    buildEvidenceSection(evidence),
    buildAllowedWritesSection(allowedWrites),
    buildForbiddenWritesSection(forbiddenWrites),
    buildRequiredSectionsSection(requiredSections),
    [
      "CHECKPOINT NAMING",
      "Name the checkpoint file using the format:",
      "  .witness/checkpoints/YYYY-MM-DD-HH-MM-<slug>.md",
      "where <slug> is a short lowercase description of the work captured.",
      "Do not overwrite an existing checkpoint file.",
    ].join("\n"),
    buildHumanReviewSection(),
    buildStopConditionSection(),
  ]);

  return {
    kind: "create-checkpoint",
    title: "Create Witness Checkpoint",
    prompt: wrapPrompt(body),
    allowedWrites,
    forbiddenWrites,
    requiredSections,
  };
}

function buildPrepareHandoverPrompt(
  params: ArtifactMaintenancePromptParams
): ArtifactMaintenancePrompt {
  const { maintenanceTitle, maintenanceReason, evidence, activeSessionId, taskGoal } = params;

  const filesToRead: string[] = [
    ".witness/AGENTS.md",
    ".witness/current-state.md",
  ];
  if (activeSessionId) {
    filesToRead.push(`.witness/sessions/${activeSessionId}.md`);
  }
  filesToRead.push(
    "Latest risk assessment file (if referenced in current-state.md)",
    "Relevant subagent reports (if referenced in current-state.md or evidence below)"
  );

  const allowedWrites = [
    ".witness/handovers/YYYY-MM-DD-HH-MM.md (new timestamped handover file)",
    ".witness/handovers/latest.md (pointer update to the new handover)",
  ];

  const forbiddenWrites = [
    ...COMMON_FORBIDDEN_WRITES,
    "Prior handover files other than updating the latest.md pointer",
    "Subagent ledger files (.witness/subagents/)",
    "Session files (.witness/sessions/)",
  ];

  const requiredSections = [
    "Session Summary",
    "Completed Work",
    "Current State",
    "Open Risks",
    "Next Steps",
    "Resume Instructions",
    "Evidence Used",
    "Uncertainty",
  ];

  const body = assembleSections([
    buildRoleSection(),
    buildTaskSection(maintenanceTitle, maintenanceReason, taskGoal),
    [
      "FILES TO READ",
      "Read the following files before drafting the handover.",
      "Do not read files outside this list unless the developer asks.",
      formatList(filesToRead),
    ].join("\n"),
    buildEvidenceSection(evidence),
    buildAllowedWritesSection(allowedWrites),
    buildForbiddenWritesSection(forbiddenWrites),
    buildRequiredSectionsSection(requiredSections),
    [
      "HANDOVER NAMING",
      "Name the new handover file using the format:",
      "  .witness/handovers/YYYY-MM-DD-HH-MM.md",
      "After writing the handover, update .witness/handovers/latest.md to reference it.",
      "Do not delete or overwrite prior handover files.",
    ].join("\n"),
    buildHumanReviewSection(),
    buildStopConditionSection(),
  ]);

  return {
    kind: "prepare-handover",
    title: "Prepare Witness Handover",
    prompt: wrapPrompt(body),
    allowedWrites,
    forbiddenWrites,
    requiredSections,
  };
}

function buildReviewSubagentArtifactsPrompt(
  params: ArtifactMaintenancePromptParams
): ArtifactMaintenancePrompt {
  const { maintenanceTitle, maintenanceReason, evidence, activeSessionId, taskGoal } = params;

  const filesToRead: string[] = [
    ".witness/AGENTS.md",
    "The relevant .witness/subagents/ entry directory for the subagent under review",
    "  - contract.md (if present)",
    "  - context-packet.md (if present)",
    "  - evidence.md (if present)",
    "  - report.md (if present)",
  ];
  if (activeSessionId) {
    filesToRead.push(`.witness/sessions/${activeSessionId}.md (for session context)`);
  }

  const allowedWrites = [
    ".witness/subagents/<subagent-entry>/ (review output only, within the specific entry being reviewed)",
  ];

  const forbiddenWrites = [
    ...COMMON_FORBIDDEN_WRITES,
    "Subagent entries not being reviewed in this task",
    "contract.md or report.md within the reviewed entry (read-only — do not alter the original artifacts)",
    "Session files (.witness/sessions/)",
    "Handover files (.witness/handovers/)",
  ];

  const requiredSections = [
    "Reviewed Subagent",
    "Evidence Checked",
    "Findings",
    "Integration Risk",
    "Recommended Decision",
    "Uncertainty",
  ];

  const body = assembleSections([
    buildRoleSection(),
    buildTaskSection(maintenanceTitle, maintenanceReason, taskGoal),
    [
      "FILES TO READ",
      "Read the following files before drafting the review.",
      "Do not read files outside this list unless the developer asks.",
      formatList(filesToRead),
    ].join("\n"),
    buildEvidenceSection(evidence),
    buildAllowedWritesSection(allowedWrites),
    buildForbiddenWritesSection(forbiddenWrites),
    buildRequiredSectionsSection(requiredSections),
    [
      "SUBAGENT REVIEW CONSTRAINTS",
      "You may draft review content based on the artifacts you read.",
      "You must not claim the review is approved by the developer.",
      "The developer makes the final review decision.",
      "Your Recommended Decision section must offer one of: accept / reject / revise.",
      "Explain the rationale for your recommendation clearly.",
      "If the report.md is missing or incomplete, note this as a finding.",
      "Do not claim tests passed unless test output is present in evidence.md or report.md.",
    ].join("\n"),
    buildHumanReviewSection(),
    buildStopConditionSection(),
  ]);

  return {
    kind: "review-subagent-artifacts",
    title: "Review Subagent Artifacts",
    prompt: wrapPrompt(body),
    allowedWrites,
    forbiddenWrites,
    requiredSections,
  };
}

function buildResumeWithWitnessPrompt(
  params: ArtifactMaintenancePromptParams
): ArtifactMaintenancePrompt {
  const { maintenanceTitle, maintenanceReason, evidence, activeSessionId, taskGoal } = params;

  const filesToRead: string[] = [
    ".witness/AGENTS.md",
    ".witness/index.md",
    ".witness/current-state.md",
    ".witness/handovers/latest.md",
    "Latest reviewed context packet (if provided by the developer in this session)",
  ];
  if (activeSessionId) {
    filesToRead.push(`.witness/sessions/${activeSessionId}.md (if an active session is present)`);
  }

  // Resume prompts do not write by default.
  const allowedWrites: string[] = [
    "(none — this is a read-only resume orientation prompt)",
    "The developer must explicitly request any .witness/ writes before you make them.",
  ];

  const forbiddenWrites = [
    ...COMMON_FORBIDDEN_WRITES,
    ".witness/ files of any kind (unless the developer explicitly requests a specific write after reviewing the summary)",
  ];

  const requiredSections = [
    "Current Goal",
    "Completed Work",
    "Open Risks",
    "Relevant Artifacts",
    "Next Recommended Action",
    "Questions Before Editing",
  ];

  const body = assembleSections([
    buildRoleSection(),
    buildTaskSection(maintenanceTitle, maintenanceReason, taskGoal),
    [
      "FILES TO READ",
      "Read the following files to build the resume summary.",
      "Do not read files outside this list unless the developer asks.",
      formatList(filesToRead),
    ].join("\n"),
    buildEvidenceSection(evidence),
    buildAllowedWritesSection(allowedWrites),
    buildForbiddenWritesSection(forbiddenWrites),
    buildRequiredSectionsSection(requiredSections),
    [
      "RESUME ORIENTATION CONSTRAINTS",
      "Do not begin editing files immediately.",
      "Your job in this prompt is to summarize and orient, not to act.",
      "After producing the resume summary, stop and ask the developer:",
      "  - Does this summary accurately reflect the current state?",
      "  - What is the next action you want to take?",
      "  - Are there any corrections before we begin?",
      "Do not proceed to source-code changes until the developer confirms.",
      "If the latest handover and current-state.md conflict, note the conflict",
      "and ask the developer to clarify before proceeding.",
    ].join("\n"),
    buildHumanReviewSection(),
    buildStopConditionSection(),
  ]);

  return {
    kind: "resume-with-witness",
    title: "Prepare Resume Prompt",
    prompt: wrapPrompt(body),
    allowedWrites,
    forbiddenWrites,
    requiredSections,
  };
}

// ---------------------------------------------------------------------------
// Core export
// ---------------------------------------------------------------------------

/**
 * Generate a strict, copy-ready artifact maintenance prompt.
 *
 * The returned `ArtifactMaintenancePrompt.prompt` string is the complete text
 * the developer pastes into their active coding agent. `allowedWrites`,
 * `forbiddenWrites`, and `requiredSections` are structured mirrors of the
 * constraints embedded in the prompt text, for downstream validation use.
 *
 * This function is pure: same params always produce the same output.
 * It performs no I/O, makes no LLM calls, and emits no telemetry.
 */
export function generateArtifactMaintenancePrompt(
  params: ArtifactMaintenancePromptParams
): ArtifactMaintenancePrompt {
  switch (params.kind) {
    case "update-current-state":
      return buildUpdateCurrentStatePrompt(params);
    case "create-checkpoint":
      return buildCreateCheckpointPrompt(params);
    case "prepare-handover":
      return buildPrepareHandoverPrompt(params);
    case "review-subagent-artifacts":
      return buildReviewSubagentArtifactsPrompt(params);
    case "resume-with-witness":
      return buildResumeWithWitnessPrompt(params);
  }
}
