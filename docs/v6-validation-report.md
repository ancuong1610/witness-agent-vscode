# Witness Agent v6 Validation Report

**Date**: 2026-05-23
**Version**: v6 (v6.1 through v6.7)
**Theme**: Agent-Assisted Artifact Maintenance
**Core boundary**: LLM may draft. Witness validates. Developer approves.

---

## 1. Overview

v6 adds agent-assisted artifact maintenance to Witness Agent. The mechanism is prompts and
validation, not direct LLM API calls.

Witness detects when `.witness/` artifacts need maintenance, generates a strict copy-ready
prompt for the developer's active coding agent, and validates the artifact changes that agent
produces. The developer pastes the prompt, reviews the draft, and approves or corrects.

Witness does not call an LLM directly in v6.
Witness does not manage API keys in v6.
Witness does not inject prompts automatically into coding agents.
Witness does not automatically modify source code.
Witness generates strict prompts for the active coding agent.
Witness validates artifact-maintenance output.
The developer remains reviewer and approver throughout.

---

## 2. Final Counts

| Metric | Value |
|--------|-------|
| `package.json` contributes.commands | 29 |
| `package.json` activationEvents | 30 |
| `extension.ts` registerCommand calls | 29 |
| Runtime dependencies (non-devDeps) | 0 |
| Internal-only commands (not in package.json) | 1 (`witness.openStatusActions`) |

`witness.openStatusActions` is registered by `initializeWitnessStatusBar` and bound to the
status bar item. It is not listed in `package.json` contributes.commands and is not user-invokable
from the Command Palette.

---

## 3. v6.1 — Maintenance Trigger Engine

**Module**: `src/core/maintenanceTriggerEngine.ts`

Validation checklist:

- Pure synchronous function. No side effects.
- No `vscode` import.
- No filesystem reads.
- No filesystem writes.
- No LLM calls.
- Single import: `WitnessWorkspaceStatus` from `./workspaceStatusTypes`.
- Computes `MaintenanceNeed` from `MaintenanceTriggerInput`.
- 11 rules implemented in priority order:
  1. No `.witness/` directory — return none, recommend `witness.enableProject`
  2. No active session — return `resume-with-witness`, recommend `witness.startTrackingTask`
  3. Blocked or pending subagents — return `review-subagent-artifacts`
  4. Risk RED or BLOCKED — return `prepare-handover`, severity critical
  5. Risk ORANGE — return `prepare-handover`, severity warning
  6. Current-state stale (>120 min) — return `update-current-state`
  7. Current-state missing — return `update-current-state`
  8. Dirty workspace with 3+ changed files and no checkpoint — return `create-checkpoint`
  9. Handover stale (>180 min) — return `prepare-handover`
  10. No handover and active session — return `prepare-handover`, severity info
  11. All-clear — return none

Exports: `MaintenanceNeedKind`, `MaintenanceSeverity`, `MaintenanceNeed`,
`MaintenanceTriggerInput`, `computeMaintenanceNeed`, `buildEvidence`.

---

## 4. v6.2 — Artifact Maintenance Prompt Generator

**Module**: `src/core/artifactMaintenancePromptGenerator.ts`

Validation checklist:

- Pure function. No side effects.
- Zero imports (fully self-contained).
- No filesystem reads or writes.
- No LLM calls.
- No VS Code imports.
- Produces five prompt kinds:
  - `update-current-state`
  - `create-checkpoint`
  - `prepare-handover`
  - `review-subagent-artifacts`
  - `resume-with-witness`

Required safety wording present in all prompts (via `buildRoleSection`):

- "Do not modify application source code."
- "Only edit files explicitly listed under Allowed writes."
- "Do not claim tests passed unless test output exists."
- "After writing, stop for human review."

Additional invariants: every prompt is wrapped in
`--- WITNESS ARTIFACT MAINTENANCE PROMPT ---` / `--- END ---` delimiters. Every prompt names
the allowed write targets. Every prompt names forbidden actions. Every prompt lists required output
sections.

Exports: `ArtifactMaintenancePromptKind`, `ArtifactMaintenancePromptParams`,
`ArtifactMaintenancePrompt`, `generateArtifactMaintenancePrompt`.

---

## 5. v6.3 — Harness Contract Templates

**New subdirectory**: `.witness/checkpoints/` (added to `WITNESS_SUBDIRS` in
`src/core/witnessPaths.ts`)

**New harness contracts** (added to `HARNESS_TEMPLATE_FILES` in `src/core/templates.ts`):

| Template source | Runtime path | Kind |
|-----------------|-------------|------|
| `src/templates/harness/current-state.md` | `.witness/harness/current-state.md` | update-current-state |
| `src/templates/harness/checkpoint.md` | `.witness/harness/checkpoint.md` | create-checkpoint |
| `src/templates/harness/handover.md` | `.witness/harness/handover.md` | prepare-handover |
| `src/templates/harness/resume.md` | `.witness/harness/resume.md` | resume-with-witness |
| `src/templates/harness/subagent-review.md` | `.witness/harness/subagent-review.md` | review-subagent-artifacts |

Each contract contains all eight required sections:

1. Purpose
2. Inputs to Read
3. Evidence to Collect
4. Allowed Writes
5. Forbidden Actions
6. Required Output Sections
7. Completion Checklist
8. Human Review Note

Write-if-missing semantics: `writeFileIfMissing` is used for all harness contracts. Re-running
`Witness: Enable for This Project` after a contract exists is a no-op for that file.

No new public commands. No `package.json` changes.

---

## 6. v6.4 — Update Project Memory with Agent

**Command**: `Witness: Update Project Memory with Agent`
**Command ID**: `witness.updateProjectMemoryWithAgent`
**Module**: `src/commands/updateProjectMemoryWithAgent.ts`

Validation checklist:

- Command exists in `package.json` contributes.commands. ✓
- Command is registered in `extension.ts`. ✓
- Command does not call any LLM. ✓
- Command does not write to `.witness/` directly. ✓
- Command does not modify source code. ✓
- Command opens a copy-ready unsaved markdown tab with the generated prompt. ✓
- Command offers a "Copy Prompt" notification action. ✓
- Command requires `.witness/` to exist before proceeding. ✓
- Command requires an open workspace folder. ✓

Flow:
1. Guard: workspace must be open.
2. Guard: `.witness/` must exist.
3. `computeWorkspaceStatus` to read current artifact state.
4. `computeMaintenanceNeed` to determine what maintenance is needed.
5. Handle `none` cases (up to date, or not enabled).
6. `generateArtifactMaintenancePrompt` to produce the strict prompt.
7. `presentPrompt` to open unsaved markdown tab and show Copy Prompt notification.

Telemetry event emitted: `witness.artifact_maintenance.prompt_generated`

Telemetry attributes (no raw content):
`maintenance_kind`, `severity`, `evidence_count`, `active_session_present`,
`prompt_opened`, `copied_to_clipboard`, `completed`, `cancelled_at`

---

## 7. v6.5 — Artifact Maintenance Validator

**Core module**: `src/core/artifactMaintenanceValidator.ts`
**Command**: `Witness: Validate Artifact Maintenance`
**Command ID**: `witness.validateArtifactMaintenance`
**Command module**: `src/commands/validateArtifactMaintenance.ts`

Core validator checklist:

- Pure synchronous function. No side effects. ✓
- No VS Code import. ✓
- No filesystem reads. ✓
- No filesystem writes. ✓
- No LLM calls. ✓

Validation rules:

- **Rule 1** (critical): Partitions changed files into `.witness/` and non-`.witness/` paths.
  Any non-`.witness/` file in `changedFiles` produces a critical failure.
- **Rule 2** (warning): Empty `changedFiles` list produces a warning.
- **Rule 3** (warning): When `expectedKind` is provided, checks that required sections are
  present in the supplied `.witness/` artifact content. Missing sections produce a warning.
  Required sections are kind-specific (6–8 sections per kind).
- **Rule 4** (warning): Detects unresolved placeholder markers
  (`TODO`, `TBD`, `{{`, `}}`, `[FILL`, `<...>`) in `.witness/` artifact content.
- **Rule 5**: Generates a plain-text summary from the final status.

Validation status values: `passed`, `warning`, `failed`

Command checklist:

- Command exists in `package.json` contributes.commands. ✓
- Command is registered in `extension.ts`. ✓
- Changed-file detection uses `observeGit` (VS Code git extension dirty file list), with
  manual InputBox fallback when git is unavailable. ✓
- Developer selects maintenance kind from QuickPick (or skips section validation). ✓
- Validator reads `.witness/` markdown files via `vscode.workspace.fs` before calling
  `validateArtifactMaintenance`. ✓
- Validation report is opened in an unsaved markdown tab for developer review. ✓

Telemetry event emitted: `witness.artifact_maintenance.validated`

---

## 8. v6.6 — Status Bar Integration

**Module**: `src/core/statusBar.ts` (updated to v6.6)

Validation checklist:

- `computeMaintenanceNeed` imported from `./maintenanceTriggerEngine`. ✓
- `buildRecommendedItem` priority A–F:
  - A. `status === null` → Show Workspace Status
  - B. `activeSessionId === null` → Start Tracking
  - C/D. `computeMaintenanceNeed` — if kind is not `none` → `Maintain: <title>` with
    `witness.updateProjectMemoryWithAgent`
  - E. `suggestedAction.id !== 'all-clear'` → Resolve continuity issue
  - F. All-clear → Create Checkpoint ✓
- Maintenance check (C/D) wrapped in try/catch. Failure falls through to E. ✓
- Tooltip includes one maintenance line: `Maintenance: <title>` or `Maintenance: up to date`. ✓
- Tooltip maintenance block wrapped in try/catch. Omitted on failure. ✓
- Beginner Actions include `witness.updateProjectMemoryWithAgent`. ✓
- Beginner Actions include `witness.validateArtifactMaintenance`. ✓
- Deduplication: if `updateProjectMemoryWithAgent` is the recommended item, it is suppressed
  from Beginner Actions automatically. ✓
- No automatic command execution at any point. ✓

---

## 9. Non-Autonomy Validation

The following behaviors are absent from the v6 implementation:

| Behavior | Status |
|----------|--------|
| Direct LLM API calls | Not present |
| Provider settings or configuration | Not present |
| API key storage or retrieval | Not present |
| MCP server or protocol integration | Not present |
| Automatic prompt injection into coding agents | Not present |
| Raw prompt text in telemetry | Not present |
| Raw transcript capture | Not present |
| Hidden reasoning capture | Not present |
| Automatic source-code modification | Not present |
| Automatic artifact approval | Not present |

All v6 LLM-related activity flows through a developer-operated channel: the developer pastes
the generated prompt into their active coding agent. Witness does not initiate that action.

---

## 10. Known Limitations

- The prompt workflow requires the developer to manually copy and paste (or otherwise transfer)
  the generated prompt into their active coding agent. No automatic channel exists.
- No direct provider integration exists in v6. This is by design. Route B (direct provider call)
  is explicitly deferred and requires a separate milestone decision.
- The artifact validator depends on the changed-file list the developer supplies. If the coding
  agent made changes outside the VS Code workspace or using tools that do not appear in the git
  dirty list, those files may not be captured.
- The VS Code git extension's dirty file list is capped at the top 10 files by the existing
  `observeGit` implementation. Files beyond that limit require manual entry.
- Validation is structural, not semantic. The validator checks that required section headings are
  present and that no placeholder markers remain. It does not verify that the section content is
  accurate or appropriate.
- Human review remains required. The validator finding `passed` does not mean the artifact
  content is correct — only that its structure meets the required shape.
- Witness does not detect hidden model context pressure or reasoning quality. Observable artifact
  ages and missing sections are the only signals available.

---

## 11. Regression Checklist

### Compile

- `npx tsc --noEmit` passes with zero errors. ✓

### Command counts

- `package.json` contributes.commands: 29 ✓
- `package.json` activationEvents: 30 ✓
- `extension.ts` registerCommand calls: 29 ✓
- `witness.openStatusActions` absent from `package.json` contributes.commands: ✓

### Dependency count

- Runtime dependencies added in v6: 0 ✓

### Smoke test descriptions

The following scenarios were reviewed against source code. No automated test runner is
available; results are based on code inspection.

**Update Project Memory with Agent**: Command exists. Flow: workspace guard, `.witness/` guard,
`computeWorkspaceStatus`, `computeMaintenanceNeed`, prompt generation, `presentPrompt` opening
unsaved markdown tab. Does not write `.witness/` directly. Does not call LLM. Emits telemetry.

**Validate Artifact Maintenance**: Command exists. Flow: changed-file collection (git or manual),
kind selection QuickPick, `.witness/` content read, `validateArtifactMaintenance` (pure
validator), validation report in unsaved markdown tab. Does not write `.witness/`. Does not call
LLM. Emits telemetry.

**Status bar maintenance recommendation**: When `computeMaintenanceNeed` returns a non-`none`
kind and an active session exists, `buildRecommendedItem` returns `Maintain: <title>` wired to
`witness.updateProjectMemoryWithAgent`. Engine failure falls through to the existing continuity
resolver path.

**Harness contract creation**: `Witness: Enable for This Project` creates `.witness/harness/`
files including the five v6.3 contracts using `writeFileIfMissing`. Re-running is a no-op for
existing files.

**No source-code modification during artifact-only validation**: The validator's Rule 1 produces
a critical failure result if any non-`.witness/` file appears in `changedFiles`. No source file
is written by any v6 command or module.

---

## 12. Final v6 Status

All v6 milestones are complete.

v6 is closed.

| Milestone | Status |
|-----------|--------|
| v6.0 — Implementation Plan | Complete |
| v6.1 — Maintenance Trigger Engine | Complete |
| v6.2 — Artifact Maintenance Prompt Generator | Complete |
| v6.3 — Harness Contract Templates | Complete |
| v6.4 — Update Project Memory with Agent | Complete |
| v6.5 — Artifact Maintenance Validator | Complete |
| v6.6 — Status Bar Integration | Complete |
| v6.7 — Docs and Regression | Complete |

**Compile**: pass.
**Package.json contributes.commands**: 29.
**Package.json activationEvents**: 30.
**extension.ts registerCommand calls**: 29.
**witness.openStatusActions**: internal only, not in package.json.
**Runtime dependencies added**: 0.

Changed files in v6 (summary):

- `docs/v6-implementation-plan.md` — created (v6.0), stamped per milestone
- `src/core/maintenanceTriggerEngine.ts` — created (v6.1)
- `src/core/artifactMaintenancePromptGenerator.ts` — created (v6.2)
- `src/core/witnessPaths.ts` — modified (v6.3, checkpoints subdir)
- `src/core/templates.ts` — modified (v6.3, 5 harness contracts registered)
- `src/templates/harness/current-state.md` — created (v6.3)
- `src/templates/harness/checkpoint.md` — created (v6.3)
- `src/templates/harness/handover.md` — created (v6.3)
- `src/templates/harness/resume.md` — created (v6.3)
- `src/templates/harness/subagent-review.md` — created (v6.3)
- `src/commands/updateProjectMemoryWithAgent.ts` — created (v6.4)
- `src/core/artifactMaintenanceValidator.ts` — created (v6.5)
- `src/commands/validateArtifactMaintenance.ts` — created (v6.5)
- `src/extension.ts` — modified (v6.4 and v6.5, two new command registrations)
- `package.json` — modified (v6.4 and v6.5, two new commands and activation events)
- `src/templates/commands.md` — modified (v6.4 and v6.5, Group 9 added)
- `src/core/statusBar.ts` — modified (v6.6, maintenance integration)
- `docs/v6-validation-report.md` — created (v6.7)
- `docs/workflow.md` — modified (v6.7, maintenance loop added)
- `docs/architecture.md` — modified (v6.7, v6 section added)
- `docs/product-ux-principles.md` — modified (v6.7, v6 principle added)
- `README.md` — modified (v6.7, v6 section added)
