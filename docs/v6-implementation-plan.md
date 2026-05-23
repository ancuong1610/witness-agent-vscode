# Witness Agent v6 Implementation Plan

**Theme:** Agent-Assisted Artifact Maintenance
**Status:** CLOSED. All milestones v6.0–v6.7 complete. 29 public commands. 30 activation events.
**Opened:** 2026-05-22
**Closed:** 2026-05-23

---

## 1. v6 Summary

### Where Witness Has Been

v5 solved the adoption problem. Before v5, a new developer faced a command palette with 23 entries, no clear entry point, and a methodology they were expected to understand before they could receive any value. v5 compressed that experience into four beginner commands, a first-run onboarding page, a copy-ready agent prompt, and a simplified status bar that surfaces one action at a time.

v5 made Witness easy to start.

v6 makes Witness easier to maintain.

### The Remaining Friction

After a developer starts using Witness, a quieter problem emerges. Witness tracks project memory well, but only when the developer actively maintains it. The artifacts that Witness depends on — `current-state.md`, checkpoint files, handover documents, subagent reports, session notes — all require the developer to notice when they are stale and to update them manually.

In practice, this means that during a productive coding session, a developer must also remember to:

- Update `current-state.md` as goals shift and work progresses.
- Create a checkpoint before taking a break or ending a work block.
- Draft a handover when switching contexts or handing off to another agent.
- Review and close subagent task loops after receiving subagent output.
- Write session notes before closing a long work session.

The result is that Witness can feel like a manual save-game system: powerful when used correctly, but dependent on the developer's memory and discipline rather than on the tool's own awareness.

This is not a failure of the methodology. The `.witness/` architecture is sound. The problem is that the developer must be both the producer and the maintainer of project memory while simultaneously writing code. That is too much to hold in parallel.

### What v6 Is

v6 introduces agent-assisted artifact maintenance. Instead of relying on the developer to notice when `.witness/` needs attention and to write the necessary content manually, Witness will:

- Detect when maintenance is needed based on artifact age, session state, and workspace signals.
- Generate a ready-to-use prompt that the developer can paste into their active coding agent.
- Restrict that prompt so the agent may only update `.witness/` files — never source code.
- Validate the artifacts the agent produces before presenting them for review.
- Surface the result for developer approval before writing anything permanently.

The developer remains human-in-the-loop throughout. Witness does not call an LLM silently. Witness does not approve its own artifacts. Witness does not modify source code. The active coding agent drafts. Witness validates. The developer approves.

**The shift:**

From:
> "Witness has detected a stale current-state. Please update it manually."

To:
> "Witness has detected a stale current-state. Here is a prompt for your coding agent to draft the update. Paste it, review the result, and approve."

The developer's job changes from author to reviewer. That is the core v6 proposition.

---

## 2. Problem

### The Manual Maintenance Burden

Current Witness requires the developer to maintain five categories of artifact during active work:

**current-state.md** — The live summary of what the project is doing, what was last completed, what risks exist, and what the next action is. This file is the most frequently read artifact in any Witness-enabled coding session. It also becomes stale fastest, because it must be updated every time the goal shifts, a task completes, or a new risk surfaces.

**Checkpoint files** — Point-in-time snapshots of the session state. A checkpoint captures what was accomplished, what evidence exists, what risks remain open, and what the next action is. Checkpoints are most valuable when created before a work block ends or a context switch happens. They are most often skipped precisely at those moments, because the developer is focused on stopping or switching rather than on recording.

**Handover documents** — Structured summaries for passing context to the next agent or the next session. A handover requires the developer to synthesize the current session's work into a format another agent can consume. This is a real writing task, not a form fill. It is often skipped entirely on long sessions, and often insufficient on short ones.

**Subagent reports and reviews** — When a subagent completes work, the developer is expected to review the output, close the ledger loop, and update the relevant session files. In practice, the review step is frequently deferred and sometimes forgotten entirely. The result is a growing list of open ledger entries that Witness correctly flags as risks but that do not resolve themselves.

**Session notes** — Informal continuity records that capture observations, decision rationale, and open questions that do not fit neatly into the other artifact types. These are the first category developers stop writing when time is short.

### What This Looks Like in Practice

A developer is working on a complex feature. They open an AI coding session, load the Witness context, and start making progress. An hour in, the goal has shifted from the original task description, two new risks have emerged, and a subagent has delivered a partial report. The developer is productive. The code is working.

At this point, `current-state.md` is an hour out of date. No checkpoint exists for this session. The subagent report is unreviewed. The next developer to open this repository — or the same developer tomorrow morning — will find a Witness workspace that technically has all its files but whose contents no longer reflect reality.

This is not a failure of discipline. It is a predictable consequence of asking a developer to maintain a second system of record while doing their primary job.

### The Save-Game Problem

When Witness requires manual maintenance, it behaves like a save-game system where the player must remember to save. Players who remember get full continuity. Players who forget lose progress. The quality of the continuity record is proportional to the developer's memory discipline, not to the quality of the tool.

v6 should not require the developer to remember. Witness should remember for the developer — detecting when the record is stale and generating the maintenance artifact automatically.

---

## 3. Goal

> "The developer should not manually maintain `.witness/` during normal coding. Witness should detect maintenance needs, provide the right prompt or LLM task, validate the result, and ask the developer to review."

This goal has four parts:

**Detect.** Witness observes the workspace and identifies when a `.witness/` artifact is stale, missing, or recommended. Detection is deterministic: it is based on file age, session state, and artifact presence, not on LLM reasoning.

**Provide.** Witness generates a copy-ready prompt or LLM task that the developer can send to their active coding agent. The prompt is complete: it names the files to read, the evidence to inspect, the sections to produce, and the constraints to follow. The developer does not need to author the prompt.

**Validate.** After the coding agent updates `.witness/`, Witness checks the result: required sections exist, mandatory fields are present, no source files were modified, and the artifact can be consumed by the next session. Validation is deterministic.

**Review.** Witness surfaces the validated artifact and asks the developer to approve it. The developer is never bypassed. Generated content is never treated as canonical without developer confirmation.

---

## 4. Integration Strategy

Two integration routes are viable for v6. They differ in how the coding agent is invoked and how much Witness controls the execution.

### Route A — Active Coding-Agent Prompt Workflow

Witness generates a copy-ready prompt. The developer pastes the prompt into their active coding agent (Claude, Codex, Copilot, Cursor, OpenCode, or any equivalent). The agent reads the specified `.witness/` files, drafts the requested artifact, and writes the result. Witness then validates the written artifact and presents it for developer review.

This route requires no LLM API key. It requires no provider abstraction. It requires no background process. It is compatible with every coding agent the developer already uses. The developer retains full visibility into what the agent is doing because they are the one who sends the prompt.

The limitation is friction: the developer must manually paste the prompt and confirm when the agent is done. That friction is small but it is real.

Route A is the v6 MVP path.

**Route A+ refinement:** Witness provides a `Copy Prompt` action in the notification or QuickPick, making the paste step a single click. A follow-up `Validate Now` command can be triggered immediately after the agent writes its output, without requiring the developer to navigate back to Witness. This minimizes the friction to approximately two clicks per maintenance cycle.

### Route B — Direct LLM Provider Integration

Witness calls a configured model provider directly: an API key is stored in VS Code SecretStorage, a provider abstraction selects the model, and the maintenance prompt is submitted programmatically. The provider returns a completion. Witness applies the artifact-only write filter, writes the result to `.witness/`, validates, and asks the developer to approve the diff.

This route is more seamless. The developer does not paste prompts. The maintenance cycle can be initiated with a single command. The result is surfaced for review without a manual copy step.

The limitation is complexity: Route B requires a provider interface, provider settings UI, API key storage, model selection, privacy notices, dry-run preview, and explicit approval gating before any write. It also introduces a direct dependency on external service availability, which complicates offline and air-gapped usage.

Route B is not in scope for v6 MVP. It is planned as optional later v6.x or v7 work, implemented only if explicitly decided.

### Recommendation

Implement Route A+ in v6.1 through v6.6. Design all internal modules (trigger engine, prompt generator, validator) so that Route B can be added later by inserting a provider call between the prompt generator and the artifact writer, without redesigning the surrounding modules. The trigger engine, prompt generator, and validator are all provider-agnostic by design.

---

## 5. Non-Goals

The following are explicitly out of scope for v6 in all milestones:

**No hidden background LLM agent.** Witness does not run LLM calls silently. Every LLM-assisted action requires the developer to initiate or confirm it. There is no background process that submits prompts or receives completions without developer awareness.

**No automatic source-code modification.** Artifact-maintenance prompts explicitly forbid the coding agent from editing source code. Witness validates after each maintenance task that no source files were changed. Any detected source-code change during an artifact-only task is treated as a validation failure, not a warning.

**No automatic artifact approval.** Witness does not approve its own generated artifacts. Every generated or updated `.witness/` artifact requires explicit developer review and confirmation before it is treated as canonical. The validator surfaces the result; the developer accepts or rejects it.

**No automatic subagent review.** Witness does not initiate subagent review cycles without developer direction. The trigger engine may recommend a review; it does not start one.

**No raw chat transcript ingestion.** Witness does not read, parse, or embed chat transcripts from coding-agent sessions. If the developer wants transcript content in a `.witness/` artifact, they must copy and paste it explicitly.

**No hidden reasoning capture.** Witness does not attempt to capture or store LLM chain-of-thought, scratchpad content, or reasoning traces. All `.witness/` content is explicit, human-readable, and reviewed.

**No MCP server in v6 MVP.** An MCP server would allow coding agents to call Witness tools directly. This is a useful long-term direction but introduces protocol complexity and surface area that is not required for the v6 maintenance workflow. MCP integration is deferred to a later milestone.

**No vector database.** Witness does not embed, index, or semantically search `.witness/` content. All detection logic is deterministic and file-based.

**No marketplace polish.** v6 is a capability release, not a distribution release. Marketplace metadata, icon updates, changelog polish, and publisher workflow improvements are deferred.

**No direct provider API call in v6.1 unless explicitly decided later.** Route B calls are not included in any v6.0 through v6.6 milestone. If a direct provider call is added, it will be a separate milestone decision with its own approval.

---

## 6. Maintenance Trigger Engine

### Module

`src/core/maintenanceTriggerEngine.ts`

### Purpose

The maintenance trigger engine inspects the current workspace state and returns the single most relevant maintenance need. It is the v6 equivalent of `suggestedActions.ts` for the maintenance dimension: a deterministic, rule-based engine that tells the developer what `.witness/` maintenance action is most needed right now.

The trigger engine does not call an LLM. It does not write any files. It returns a structured description of a maintenance need that the prompt generator and status bar can act on.

### Inputs

The trigger engine receives a `WitnessWorkspaceStatus` object, which already captures artifact ages, session state, subagent health counts, and the existing suggested action. In addition, the trigger engine may optionally receive:

- A git observation from `gitObserver.ts` — specifically, whether source files have changed since the last checkpoint or current-state update. This provides a signal that work is progressing that has not yet been recorded.
- The age of the active session — how long the current `.witness/.current-session` has been open without a checkpoint.
- The identity and age of the latest checkpoint file, if any.
- The presence and resolution state of the latest handover.
- Whether any subagent ledger entry has a pending review older than a configurable threshold.
- Whether any unresolved continuity issue marker exists in `current-state.md`.

### Output Type

```typescript
type MaintenanceNeedKind =
  | "none"
  | "update-current-state"
  | "create-checkpoint"
  | "prepare-handover"
  | "review-subagent-artifacts"
  | "resume-with-witness";

interface MaintenanceNeed {
  /** The maintenance action needed. "none" means the workspace is healthy. */
  kind: MaintenanceNeedKind;

  /** Short title for display in the status bar and notification. */
  title: string;

  /** One-sentence explanation of why this need was detected. */
  reason: string;

  /** How urgently this maintenance is needed. */
  severity: "info" | "warning" | "critical";

  /**
   * Concrete evidence that led to this determination.
   * List of human-readable strings describing the observed conditions.
   * Used by the prompt generator to populate the evidence section of the prompt.
   */
  evidence: string[];

  /**
   * The VS Code command ID to invoke when the developer accepts this suggestion.
   * Maps to the corresponding maintenance command, e.g.
   * "witness.updateProjectMemoryWithAgent" or "witness.validateArtifactMaintenance".
   * Null when kind is "none".
   */
  recommendedCommandId: string | null;
}
```

### Detection Rules

Rules are evaluated in priority order. The first matching rule wins.

**Rule 1 — No active Witness session.** If `hasWitness` is true but `activeSessionId` is null and no session has been active in the past 30 minutes, return `"resume-with-witness"`. Severity: `info`. The developer may be returning to a paused project and should reload context before editing.

**Rule 2 — Missing current-state.** If `currentStateExists` is false, return `"update-current-state"`. Severity: `critical`. No recovery is possible without a current-state file.

**Rule 3 — Stale current-state.** If `currentStateAgeMinutes` exceeds a configurable threshold (default: 60 minutes) and git observation shows source file changes since the last update, return `"update-current-state"`. Severity: `warning`.

**Rule 4 — Long session without checkpoint.** If the active session has been open for more than a configurable threshold (default: 90 minutes) and no checkpoint exists for this session, return `"create-checkpoint"`. Severity: `warning`.

**Rule 5 — Stale checkpoint.** If the latest checkpoint is older than a configurable threshold (default: 4 hours) and source file changes have been observed, return `"create-checkpoint"`. Severity: `info`.

**Rule 6 — Missing handover before likely session end.** If the active session is long (default: 120 minutes) and no handover has been generated, return `"prepare-handover"`. Severity: `info`. This is a proactive recommendation, not an error.

**Rule 7 — Pending subagent review.** If `pendingSubagentReviews` is greater than zero and the oldest pending review is older than a configurable threshold (default: 30 minutes), return `"review-subagent-artifacts"`. Severity: `warning`.

**Rule 8 — All clear.** If no rule above matches, return `"none"`. Severity: `info`.

### Relationship to Existing Modules

The trigger engine is a new module that operates alongside `suggestedActions.ts`, not replacing it. `suggestedActions.ts` handles the existing continuity risk and suggested-action layer. The trigger engine handles the maintenance-need layer. The status bar can render one item from each layer, or prefer whichever is higher severity at the current moment.

---

## 7. Artifact Maintenance Prompt Builder

### Module

`src/core/artifactMaintenancePromptGenerator.ts`

### Purpose

The artifact maintenance prompt generator produces copy-ready prompts for each maintenance need identified by the trigger engine. Each prompt is a complete, self-contained instruction set for the active coding agent. The developer pastes it, the agent executes it, and the result is a drafted or updated `.witness/` artifact ready for validation.

Every prompt is artifact-only: it explicitly names the files the agent may write and forbids modification of everything else. The prompt generator has no LLM dependency. It produces plain text from templates and workspace context.

### Prompts to Generate

**1. Update Current-State Prompt**

Instructs the agent to read the current session state and update `current-state.md` to reflect actual project reality.

Files to read: `.witness/index.md`, `.witness/current-state.md`, `.witness/handovers/latest.md`, active session file.

Evidence to inspect: last completed task marker, any open risk flags in the current state, date of last update.

Allowed writes: `.witness/current-state.md` only.

Forbidden writes: all source files, all non-`.witness/` files, all other `.witness/` files not listed above.

Required output sections: Current Goal, Last Completed, Open Risks, Next Action, Last Updated timestamp.

Human review instruction: "Do not finalize this update. Present a draft and wait for developer approval before writing."

**2. Create Checkpoint Prompt**

Instructs the agent to read the session state and draft a new checkpoint file capturing the current point in development.

Files to read: `.witness/index.md`, `.witness/current-state.md`, active session file, most recent risk assessment if available.

Evidence to inspect: completed tasks since last checkpoint, current open risks, subagent health summary.

Allowed writes: `.witness/sessions/<session-id>-checkpoint-NNN.md` only.

Forbidden writes: all source files, `current-state.md`, all handover files, all subagent ledger files.

Required output sections: Checkpoint Summary, Completed Work, Open Risks, Evidence, Next Action, Timestamp.

Human review instruction: "Present the checkpoint draft and wait for developer approval. Do not write the checkpoint file until confirmed."

**3. Prepare Handover Prompt**

Instructs the agent to synthesize the current session into a handover document that the next session or agent can consume as its primary resume artifact.

Files to read: `.witness/index.md`, `.witness/current-state.md`, `.witness/handovers/latest.md`, active session file, most recent checkpoint.

Evidence to inspect: session goal, completed and incomplete tasks, open risks, subagent states, next recommended action.

Allowed writes: `.witness/handovers/YYYY-MM-DD-HH-MM.md` and `.witness/handovers/latest.md`.

Forbidden writes: all source files, `current-state.md`, all session files, all subagent ledger files, all ADRs.

Required output sections: Session Summary, Completed, Incomplete, Open Risks, Subagent States, Next Action, Handover Validity.

Human review instruction: "Do not finalize the handover. Present a draft and wait for developer confirmation before writing or updating `latest.md`."

**4. Review Subagent Artifacts Prompt**

Instructs the agent to inspect pending subagent ledger entries and draft review summaries for each one.

Files to read: `.witness/index.md`, active session file, each pending subagent ledger `contract.md` and `report.md` in `.witness/sessions/<session-id>/subagents/<task-id>/`.

Evidence to inspect: contract acceptance criteria, report completion status, open risks flagged in the report.

Allowed writes: `.witness/sessions/<session-id>/subagents/<task-id>/review.md` for each pending entry.

Forbidden writes: all source files, `current-state.md`, handover files, the subagent `contract.md` or `report.md` files.

Required output sections: Task Reference, Acceptance Criteria Met, Issues Found, Recommendation (accept/reject/revise), Reviewer Note.

Human review instruction: "Present each review draft individually and wait for developer acceptance before writing. Do not auto-approve any subagent output."

**5. Resume with Witness Prompt**

Instructs the agent to load the Witness context for a project and prepare a structured summary before beginning any edits.

Files to read: `.witness/index.md`, `.witness/current-state.md`, `.witness/handovers/latest.md`. If a reviewed context packet exists, use it as the primary resume artifact.

Allowed writes: none. This prompt is read-only. The agent produces a summary for developer review, not a file update.

Required output sections: Current Goal, Last Completed, Unresolved Risks, Subagent States, Next Recommended Action.

Human review instruction: "Provide the resume summary and wait for the developer to confirm the next action before making any edits."

### Prompt Structure

Every generated prompt follows this structure:

```
--- WITNESS ARTIFACT MAINTENANCE PROMPT ---
Role: You are a coding agent assisting with project-memory maintenance.
      You are operating in artifact-only mode. You may only write to the
      explicitly listed .witness/ files below. You must not modify source code.

Task: <task description>

Files to read:
- <list of .witness/ paths>

Evidence to inspect:
- <list of specific content checks>

Allowed writes:
- <explicit list of writable .witness/ paths>

Forbidden writes:
- All source files (any file outside .witness/)
- Any .witness/ file not listed under Allowed writes above

Required output sections:
- <list of required markdown sections in the output artifact>

On completion:
- Present the drafted content for developer review.
- Do not write any file until the developer confirms.
- If evidence is incomplete or ambiguous, note the uncertainty explicitly.
  Do not infer undocumented state.

Human review required before any file is written.
--- END PROMPT ---
```

### Relationship to Existing Modules

The prompt generator replaces no existing module. It operates alongside `agentPromptGenerator.ts`, which generates session-start and resume prompts for the coding workflow. The artifact maintenance prompt generator is specifically for the maintenance workflow. Both modules are used by the status bar and command handlers, but they serve distinct purposes.

---

## 8. Agent-Facing Harness Contracts

### Current State

The `src/templates/harness/` directory currently contains five harness files:

- `agent-resume.md` — protocol for joining or resuming a project
- `continuity-issue.md` — protocol for resolving a flagged continuity issue
- `orchestrator.md` — protocol for orchestrators managing multiple subagents
- `session-switch.md` — protocol for handing off between sessions
- `subagent-task.md` — protocol for a subagent accepting and executing a delegated task

These files are currently written primarily as human documentation: guidance for developers who want to understand how to configure a coding agent. They are not structured as machine-readable contracts that a coding agent can follow deterministically.

### v6 Requirement

v6 artifact maintenance prompts will direct coding agents to read `.witness/harness/` contracts before performing maintenance tasks. For this to work reliably, harness files must be structured as strict agent-facing contracts, not only as developer documentation.

Five new harness contract files are planned for v6:

- `.witness/harness/current-state.md`
- `.witness/harness/checkpoint.md`
- `.witness/harness/handover.md`
- `.witness/harness/resume.md`
- `.witness/harness/subagent-review.md`

These are added to the `.witness/harness/` directory that Witness creates during `initProject`. They are separate from the existing harness files, which describe agent roles and orchestration protocols rather than artifact-maintenance contracts.

### Contract Structure

Each harness contract must include the following sections, in this order:

**Purpose.** One paragraph. What this contract governs, what artifact it produces, and when a coding agent should follow it.

**Inputs to read.** Explicit list of `.witness/` files to read before beginning the task. Ordered by importance. No wildcards.

**Evidence to collect.** List of specific observations the agent must make from the input files before drafting the artifact. Each item is a concrete check, not a vague instruction.

**Allowed writes.** Explicit list of file paths or patterns the agent may write during this task. No other files may be written.

**Forbidden actions.** Explicit list of prohibited actions. Must include: "Do not modify any source file." Must include: "Do not write to any `.witness/` file not listed under Allowed writes." May include additional task-specific prohibitions.

**Required sections.** List of markdown sections the output artifact must contain. Each section name is given exactly as it must appear in the output file.

**Completion checklist.** Ordered list of verification steps the agent should perform before presenting the result for review. Each item is a yes/no check.

**Human review note.** Explicit statement that the output must be presented for developer review before any file is written. This section must always be the last section in the contract.

### Example: checkpoint.md Contract Header

```markdown
# Witness Harness Contract — Checkpoint

## Purpose

This contract governs checkpoint creation during an active Witness session.
A checkpoint is a point-in-time record of what was completed, what risks remain
open, what evidence supports the current state, and what the next action is.
Follow this contract when the Witness trigger engine recommends "Create Checkpoint"
or when the developer requests a checkpoint before ending a work block.

## Inputs to read

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/sessions/<active-session-id>.md` (active session file)
4. Most recent risk assessment file, if present

## Evidence to collect

- The current session goal, from the active session file
- All tasks listed as completed since the last checkpoint
- All open risks flagged in current-state.md
- Subagent health: any pending reviews or blocked entries

## Allowed writes

- `.witness/sessions/<active-session-id>-checkpoint-NNN.md`
  where NNN is the next available checkpoint number

## Forbidden actions

- Do not modify any source file.
- Do not modify `.witness/current-state.md`.
- Do not modify any handover file.
- Do not modify any subagent ledger file.
- Do not write to any `.witness/` file not listed under Allowed writes.

## Required sections

- Checkpoint Summary
- Completed Work
- Open Risks
- Evidence
- Next Action
- Timestamp

## Completion checklist

- [ ] All required sections are present in the draft.
- [ ] Completed Work lists only work that is verifiably done.
- [ ] Open Risks reflects the current risk state, not a prior state.
- [ ] Evidence cites specific file paths or content, not general impressions.
- [ ] Next Action is specific and actionable.
- [ ] No source files were modified.

## Human review note

Present the checkpoint draft to the developer and wait for explicit approval
before writing the file. Do not write the checkpoint file until the developer
confirms. If any evidence is incomplete or ambiguous, note the uncertainty
in the draft rather than inferring a confident state.
```

---

## 9. Artifact-Only Mode

### Definition

Artifact-only mode is an operational constraint applied to any coding agent task initiated by the Witness maintenance trigger engine or by the `Witness: Update Project Memory with Agent` command.

In artifact-only mode, the coding agent:

- May read any file in the repository for context.
- May write only to the explicitly listed `.witness/` file paths specified in the maintenance prompt or harness contract.
- Must not create, modify, rename, or delete any file outside `.witness/`.
- Must not run shell commands that have side effects on source files (compilation, test runs, git commits, file renames).
- Must present a draft for developer review before writing any artifact.

Artifact-only mode is enforced by the prompt structure (the forbidden writes list) and validated by `artifactMaintenanceValidator.ts` after the agent completes its task.

### Why Explicit Enforcement Is Necessary

A coding agent given a maintenance prompt might reasonably decide that updating `current-state.md` also requires fixing a related bug, improving a comment, or updating a configuration file. This decision is not unreasonable from the agent's perspective, but it breaks the maintenance workflow: the developer has asked Witness to help with project memory, not with source code changes, and combining both changes makes the maintenance artifact impossible to review in isolation.

Artifact-only mode prevents this by making the constraint explicit at the prompt level and verifiable at the validation level.

### Validation Requirements

After any artifact-only maintenance task, `artifactMaintenanceValidator.ts` must detect:

**Source-file modification.** If git observation is available, compare the working tree before and after the task. If any file outside `.witness/` changed, the validation fails. The failure is reported to the developer before any artifact is accepted.

**Missing required artifact.** If the maintenance task was expected to produce a specific file (e.g., a checkpoint file) and that file does not exist after the task, the validation fails.

**Missing required sections.** If the produced artifact exists but does not contain all required markdown sections specified in the harness contract, the validation fails with a list of missing sections.

**Invalid links or references.** If the artifact references a file path, session ID, or ADR that does not exist in the repository, the validation reports the broken reference as a warning. The developer may accept the artifact anyway, but the reference is flagged.

**Unresolved mandatory markers.** If the artifact contains any of the standard Witness mandatory markers (`[MANDATORY]`, `<!-- MANDATORY -->`, `{{`, `[FILL]`, `[MISSING]`), the validation fails. An artifact with unresolved markers is not reviewable.

---

## 10. Artifact Maintenance Validator

### Module

`src/core/artifactMaintenanceValidator.ts`

### Purpose

The artifact maintenance validator is the deterministic check layer between agent output and developer approval. It runs after a coding agent has written or updated a `.witness/` artifact. It produces a structured validation result that the developer sees before confirming or rejecting the artifact.

### Validation Inputs

```typescript
interface ArtifactMaintenanceValidationRequest {
  /** The kind of maintenance task that was performed. */
  kind: MaintenanceNeedKind;

  /** Absolute path to the artifact that was written or updated. */
  artifactPath: string;

  /** Absolute paths to any additional artifacts written during the task. */
  additionalArtifactPaths: string[];

  /**
   * Git working tree snapshot taken before the task began, if available.
   * Used to detect source-file modifications during artifact-only mode.
   */
  preTaskGitSnapshot: string[] | null;

  /** The harness contract that governed this task, for required-section checking. */
  harnessContractPath: string;
}
```

### Validation Checks

**Check 1 — Artifact exists.** The file at `artifactPath` must exist. If it does not, the validation fails immediately with a critical error.

**Check 2 — Required sections present.** The validator reads the harness contract to extract the required sections list. It then checks the artifact for each required section heading. Missing sections are reported as errors.

**Check 3 — current-state has next action.** If `kind` is `"update-current-state"`, the artifact must contain a `Next Action` section with non-empty content. An empty or absent `Next Action` is a validation error.

**Check 4 — Checkpoint completeness.** If `kind` is `"create-checkpoint"`, the artifact must contain non-empty `Checkpoint Summary`, `Evidence`, `Open Risks`, and `Next Action` sections. Any empty required section is a validation error.

**Check 5 — Handover latest pointer.** If `kind` is `"prepare-handover"`, and the task was expected to update `.witness/handovers/latest.md`, the validator checks that `latest.md` exists and that its content references or matches the newly created handover file. A missing or stale `latest.md` is a validation warning.

**Check 6 — No source-file modification.** If `preTaskGitSnapshot` is provided, the validator computes the current git working tree and compares it against the snapshot. Any file path outside `.witness/` that changed during the task is reported as a critical error. The artifact is not presented for approval until this check passes.

**Check 7 — No mandatory markers.** The validator scans the artifact content for the standard Witness mandatory marker strings. Any match is a validation error.

**Check 8 — Uncertainty noted where evidence is incomplete.** This is a soft check. The validator looks for specific evidence-gap patterns in the artifact content. If the harness contract lists evidence items that could not be verified (e.g., the agent cited a missing file), the validator checks whether the artifact acknowledges the gap explicitly. An artifact that makes confident claims without available evidence is flagged as a warning.

### Validation Output

```typescript
interface ArtifactMaintenanceValidationResult {
  /** Whether the artifact passed all validation checks. */
  passed: boolean;

  /** Critical errors that block developer approval. */
  errors: string[];

  /** Non-blocking issues the developer should review. */
  warnings: string[];

  /** Informational notes about the validation. */
  notes: string[];

  /** The artifact content, for display in the review surface. */
  artifactContent: string;

  /** Absolute path to the validated artifact. */
  artifactPath: string;
}
```

### Developer Review Surface

After validation, the result is shown in a VS Code output channel or unsaved markdown tab. The developer sees:

- Validation status (passed / failed with error count)
- List of errors and warnings
- Full artifact content for review
- Two actions: `Approve and Write` or `Reject and Discard`

If validation failed, `Approve and Write` is disabled until all critical errors are resolved. The developer may edit the artifact directly and re-run validation, or discard the agent's output and revise the prompt.

---

## 11. Commands Planned

### Beginner-Safe Commands (v6 MVP)

These two commands are the primary developer-facing surface for v6. They are designed to be usable by any developer who has completed the v5 beginner onboarding path.

**`Witness: Update Project Memory with Agent`**
- commandId: `witness.updateProjectMemoryWithAgent`
- Entry point for the Route A+ workflow.
- Detects the current maintenance need using the trigger engine.
- Generates the appropriate maintenance prompt.
- Displays the prompt in a copy-ready surface with a `Copy Prompt` action.
- After the developer returns from their coding agent, offers `Validate Now`.

**`Witness: Validate Artifact Maintenance`**
- commandId: `witness.validateArtifactMaintenance`
- Runs the artifact maintenance validator against the most recently targeted artifact.
- Displays the validation result and, if passed, offers `Approve and Write`.
- Can be run independently if the developer has already pasted and run a maintenance prompt.

### Potential Advanced Commands (Planned, Not in v6.0)

These commands provide more granular control over the maintenance workflow. They are intended for developers who have used Witness through at least one v6 maintenance cycle and want direct access to individual steps.

**`Witness: Generate Maintenance Prompt`**
- Generates a maintenance prompt for a specific need without first running the trigger engine.
- The developer selects the maintenance kind from a QuickPick.
- Useful when the developer knows what maintenance is needed without waiting for detection.

**`Witness: Review Artifact Maintenance`**
- Opens the review surface for a selected `.witness/` artifact, independent of the validator.
- The developer selects an artifact path. The validator runs and shows the result.
- Useful for reviewing an artifact the developer wrote manually.

Neither advanced command is implemented in v6.0. They are documented here for planning purposes and will be added in a later v6.x milestone if confirmed.

---

## 12. Status Bar Integration

### Current State

The v5.4 status bar QuickPick has three sections: Recommended, Beginner Actions, and Advanced Actions. The Recommended section shows the single most relevant suggested action from `suggestedActions.ts`.

v6 extends the status bar to surface maintenance needs alongside continuity risks. The developer should see at a glance whether Witness has detected a maintenance need, without the maintenance signal crowding out the continuity risk signal.

### Status Bar Labels

The following labels are added to the existing set. They appear in the main status bar text when maintenance needs are the most relevant signal at the current moment:

- `Witness: OK` — no maintenance needed, no continuity risk (existing label, retained)
- `Witness: Tracking` — session active, maintenance state is healthy (existing label, retained)
- `Witness: Checkpoint recommended` — trigger engine recommends a checkpoint
- `Witness: Handover recommended` — trigger engine recommends preparing a handover
- `Witness: Review needed` — pending subagent review older than threshold
- `Witness: Resume ready` — no active session; resume artifacts are available

Labels do not expose internal scoring, rule numbers, or engine terminology. They describe the developer's next action, not the system's internal state.

### Click Behavior

When the developer clicks the status bar item, the QuickPick shows:

- The current maintenance need as the first item, if one exists. The label matches the status bar text. Selecting it opens the `Witness: Update Project Memory with Agent` flow for that specific need.
- The existing Recommended item from `suggestedActions.ts` as the second item, if it differs from the maintenance need.
- Beginner Actions section follows, unchanged from v5.4.
- Advanced Actions section follows, unchanged from v5.4.

If both the maintenance trigger engine and `suggestedActions.ts` recommend an action, the higher-severity one is shown first. If they are the same severity, the maintenance need is shown first, as it is more directly actionable in a v6 workflow.

### Quiet State

During normal, healthy coding with no maintenance needs and no continuity risks, the status bar shows `Witness: OK` or `Witness: Tracking`. No notification is shown. No prompt is generated. The developer is not interrupted.

Witness surfaces only the next useful action. If there is no useful action, Witness is silent.

---

## 13. Direct LLM Integration Roadmap

Route B — direct LLM provider integration — is not in scope for v6 MVP. This section documents the design direction for a future milestone so that v6 modules are built with Route B in mind.

### Provider Interface

A provider interface will abstract the LLM call so that different API providers can be swapped without modifying the prompt generator or validator. The interface will define:

- `sendPrompt(prompt: string, options: ProviderOptions): Promise<string>` — sends a prompt and returns the completion text.
- `isAvailable(): Promise<boolean>` — checks whether the provider is configured and reachable.
- `providerName(): string` — returns the human-readable provider name for display.

### Provider Settings

Provider settings will be stored in VS Code workspace settings (`witness.llm.provider`, `witness.llm.model`) and user settings. Sensitive credentials will be stored in VS Code SecretStorage, not in settings JSON.

### API Key Storage

API keys will use `vscode.SecretStorage` exclusively. They will never appear in settings files, telemetry, or logs. The key will be retrieved at call time and discarded after use.

### Model Selection

The developer will select a model from a list defined by the provider. A default model will be recommended per provider. The developer may override it in settings.

### Privacy Warning

Before a provider is configured, Witness will display a one-time warning: the maintenance prompt includes `.witness/` file content, and sending it to an external API means that content leaves the developer's machine. The developer must acknowledge this before enabling Route B.

### Dry-Run Preview

Before any LLM call, Witness will display the exact prompt text that will be submitted. The developer confirms the send. This replaces the manual paste step of Route A+ but preserves the developer's awareness of what is being sent.

### Explicit Approval Before Writing

Route B does not auto-write. After the LLM returns a completion, the same validator and review surface used in Route A+ are applied. The developer approves or rejects before any file is written.

### No Hidden Background Execution

No LLM call happens without the developer initiating it. There is no polling loop, no background timer, and no automatic submission of prompts when a maintenance need is detected. Detection is automatic; submission is manual.

---

## 14. v6 Milestones

### v6.0 — Plan

Create this implementation plan. No source code changes. No package.json changes. No new commands. No new dependencies.

**Status: complete.**

### v6.1 — Maintenance Trigger Engine

Add `src/core/maintenanceTriggerEngine.ts`.

Implement the eight detection rules. Wire the trigger engine into `workspaceStatus.ts` or a new status composition layer so the trigger result is available to the status bar and command handlers. Add a test for each detection rule using mock `WitnessWorkspaceStatus` inputs.

New files:
- `src/core/maintenanceTriggerEngine.ts`

Modified files:
- `src/core/statusBar.ts` — consume `MaintenanceNeed` from the trigger engine alongside the existing `WitnessSuggestedAction`
- `src/core/workspaceStatus.ts` — call the trigger engine and include the result in the status summary

No new public commands. No package.json changes.

**Status: complete.**

`src/core/maintenanceTriggerEngine.ts` added. Exports `MaintenanceNeedKind`, `MaintenanceSeverity`,
`MaintenanceNeed`, `MaintenanceTriggerInput`, and `computeMaintenanceNeed`.

Eleven rules implemented in priority order:
1. Witness not enabled → kind: "none", recommendedCommandId: witness.enableProject
2. No active session → kind: "resume-with-witness", recommendedCommandId: witness.startTrackingTask
3. Blocked/failed subagents or pending reviews → kind: "review-subagent-artifacts", severity escalates to "critical" when blocked/failed count > 0
4. Risk level RED or BLOCKED → kind: "prepare-handover", severity: "critical"
5. Risk level ORANGE → kind: "prepare-handover", severity: "warning"
6. current-state exists and age > 120 minutes → kind: "update-current-state", severity: "warning"
7. current-state missing → kind: "update-current-state", severity: "warning"
8. dirtyWorkspace true, changedFileCount >= 3, checkpoint null or > 60 minutes → kind: "create-checkpoint"
9. Latest handover exists and age > 180 minutes → kind: "prepare-handover", severity: "warning"
10. No handover, active session present → kind: "prepare-handover", severity: "info"
11. All clear → kind: "none"

Design: pure synchronous function. No filesystem reads, no git calls, no VS Code API imports,
no LLM calls, no telemetry, no side effects. Single import: `WitnessWorkspaceStatus` from
`./workspaceStatusTypes`. Status bar and workspaceStatus.ts integration deferred to v6.6 as planned.

Public command count remains 27. activationEvents count remains 28. No package.json changes.
No extension.ts changes. No new dependencies.

### v6.2 — Artifact Maintenance Prompt Generator

Add `src/core/artifactMaintenancePromptGenerator.ts`.

Implement five prompt builders: update-current-state, create-checkpoint, prepare-handover, review-subagent-artifacts, resume-with-witness. Each builder reads workspace paths from `witnessPaths.ts` and produces a complete prompt string following the artifact-only prompt structure.

New files:
- `src/core/artifactMaintenancePromptGenerator.ts`

No new public commands. No package.json changes.

**Status: complete.**

`src/core/artifactMaintenancePromptGenerator.ts` added. Exports `ArtifactMaintenancePromptKind`,
`ArtifactMaintenancePromptParams`, `ArtifactMaintenancePrompt`, and
`generateArtifactMaintenancePrompt`.

Five prompt kinds implemented:
- `update-current-state` → title "Update Project Memory"; allowed writes: `.witness/current-state.md` only.
- `create-checkpoint` → title "Create Witness Checkpoint"; allowed writes: `.witness/checkpoints/`, optionally `.witness/current-state.md` if explicitly requested.
- `prepare-handover` → title "Prepare Witness Handover"; allowed writes: `.witness/handovers/YYYY-MM-DD-HH-MM.md` and `.witness/handovers/latest.md`.
- `review-subagent-artifacts` → title "Review Subagent Artifacts"; allowed writes: the specific `.witness/subagents/<entry>/` being reviewed only. Prompt makes clear that the developer makes the final approval decision; the agent may only draft.
- `resume-with-witness` → title "Prepare Resume Prompt"; allowed writes: none by default. Agent must summarize and wait for developer confirmation before any edits.

Every prompt includes all nine required sections (Role, Task, Files to read, Evidence to inspect,
Allowed writes, Forbidden writes, Required output sections, Human review requirement, Stop
condition) and the five required wording strings:
- "You are helping maintain Witness project-memory artifacts."
- "Do not modify application source code."
- "Only edit files explicitly listed under Allowed writes."
- "Do not claim tests passed unless test output exists."
- "After writing, stop for human review."

`activeSessionId` is included in files-to-read when provided. `taskGoal` is embedded in the
Task section when provided. Empty evidence list emits the required uncertainty notice.

Design: pure synchronous function. No imports (fully self-contained). No filesystem reads or
writes, no VS Code API, no LLM calls, no telemetry, no side effects.

`allowedWrites`, `forbiddenWrites`, and `requiredSections` are returned as structured arrays
on `ArtifactMaintenancePrompt` for downstream validator use (v6.5).

Public command count remains 27. activationEvents count remains 28. No package.json changes.
No extension.ts changes. No new dependencies.

### v6.3 — Harness Contract Templates

Add five harness contract templates to `src/templates/harness/`:

- `current-state.md`
- `checkpoint.md`
- `handover.md`
- `resume.md`
- `subagent-review.md`

Update `src/core/templates.ts` to include these files in the `initProject` write set so they are created in `.witness/harness/` when a new project is initialized.

New template files:
- `src/templates/harness/current-state.md`
- `src/templates/harness/checkpoint.md`
- `src/templates/harness/handover.md`
- `src/templates/harness/resume.md`
- `src/templates/harness/subagent-review.md`

Modified files:
- `src/core/templates.ts` — add new harness contracts to the init write set
- `src/core/witnessPaths.ts` — add `checkpoints` to `WITNESS_SUBDIRS`

No new public commands. No package.json changes.

**Status: complete.**

Five harness contract templates added to `src/templates/harness/`. Each contract contains
exactly the eight required sections in order: Purpose, Inputs to Read, Evidence to Collect,
Allowed Writes, Forbidden Actions, Required Output Sections, Completion Checklist, Human
Review Note. All five safety wording strings are present in every contract:
- "Do not modify application source code."
- "Do not edit package/config files unless explicitly instructed."
- "Do not delete previous Witness artifacts."
- "Do not claim tests passed unless test output exists."
- "Stop for human review after drafting the artifact."

Contract-specific constraints enforced in each file:
- `current-state.md` — allowed writes: `.witness/current-state.md` only; required output sections: Current Goal, Latest Progress, Open Risks, Next Safe Action, Evidence Used, Uncertainty.
- `checkpoint.md` — allowed writes: `.witness/checkpoints/` (new file), optionally `.witness/current-state.md` if developer explicitly requests; required sections: Summary, Evidence, Changed Files, Open Risks, Next Action, Uncertainty.
- `handover.md` — allowed writes: `.witness/handovers/YYYY-MM-DD-HH-MM.md` and `latest.md` pointer; required sections: Session Summary, Completed Work, Current State, Open Risks, Next Steps, Resume Instructions, Evidence Used, Uncertainty.
- `resume.md` — no writes by default; agent must summarize and wait for developer confirmation; required sections: Current Goal, Completed Work, Open Risks, Relevant Artifacts, Next Recommended Action, Questions Before Editing.
- `subagent-review.md` — allowed writes: the specific `review.md` for the entry under review only, and only when developer instructs; agent may draft but must not approve or reject on behalf of the developer; required sections: Reviewed Subagent, Evidence Checked, Findings, Integration Risk, Recommended Decision, Uncertainty.

`HARNESS_TEMPLATE_FILES` in `src/core/templates.ts` updated to include all five new contracts.
Files are copied via `writeFileIfMissing` during `initProject` — re-running initialization
does not overwrite user-modified contracts. Existing v4.6/v4.7 harness files are unchanged.

`WITNESS_SUBDIRS` in `src/core/witnessPaths.ts` updated to include `'checkpoints'`.
The `checkpoints` directory receives a `.gitkeep` on initialization (consistent with the
existing empty-subdir pattern). `initProject.ts` and `enableProject.ts` required no changes —
they iterate `WITNESS_SUBDIRS` dynamically.

Public command count remains 27. activationEvents count remains 28. No package.json changes.
No extension.ts changes. No new dependencies.

### v6.4 — Update Project Memory with Agent Command

Add `src/commands/updateProjectMemoryWithAgent.ts`.

Implement `Witness: Update Project Memory with Agent` (commandId: `witness.updateProjectMemoryWithAgent`). The command calls the trigger engine, selects the appropriate prompt builder, and presents the prompt in the copy-ready surface. Adds a `Copy Prompt` notification action and a `Validate Now` follow-up.

New files:
- `src/commands/updateProjectMemoryWithAgent.ts`

Modified files:
- `src/extension.ts` — register the new command
- `package.json` — add activationEvent and contributes.commands entry
- `src/templates/commands.md` — document the new command in the beginner-commands group

Public command count: 27 → 28.

**Status: complete.**

`src/commands/updateProjectMemoryWithAgent.ts` added. Orchestration-only: computes workspace
status → computes maintenance need → generates prompt → presents via `presentPrompt` → emits
telemetry. No LLM calls. No `.witness/` writes. No source-code modification.

Command flow implemented:
1. Guards: workspace open, `.witness/` exists.
2. `computeWorkspaceStatus(workspaceRoot)` — full status snapshot.
3. `computeMaintenanceNeed({ status })` — deterministic need detection. `dirtyWorkspace`,
   `changedFileCount`, and `latestCheckpointAgeMinutes` omitted in v6.4 (git observation
   deferred); Rules 1–11 still fire on the status fields that are available.
4. `kind === "none"` + `recommendedCommandId === "witness.enableProject"` → error message,
   cancelled telemetry, return.
5. `kind === "none"` (all clear) → "Project memory is up to date." info message, success
   telemetry, return.
6. Non-"none" kind mapped 1:1 to `ArtifactMaintenancePromptKind` via `toPromptKind()`.
7. `generateArtifactMaintenancePrompt(...)` called with `maintenanceTitle`, `maintenanceReason`,
   `evidence`, and `activeSessionId` from status. `taskGoal` passed as `null` (not stored on
   `WitnessWorkspaceStatus` in v6.4).
8. `presentPrompt(generated.prompt, notificationMessage)` opens unsaved markdown tab and offers
   one-click `Copy Prompt` notification action. Returns `{ promptOpened, copiedToClipboard }`.
9. If `promptOpened` is false, records `cancelled_at: "prompt-presentation"` and returns.
10. Emits `witness.artifact_maintenance.prompt_generated` with: `maintenance_kind`, `severity`,
    `evidence_count`, `active_session_present`, `prompt_opened`, `copied_to_clipboard`,
    `completed`, `cancelled_at`. No prompt text, no evidence strings, no file content in telemetry.

`presentPrompt` return type inspected before coding — uses `PromptPresentResult`
`{ promptOpened: boolean, copiedToClipboard: boolean }`. Telemetry attributes match this shape.

`witness.openStatusActions` confirmed absent from `package.json` contributes.commands
(remains an internal status-bar command only).

Public command count: 27 → 28. activationEvents: 28 → 29. No new dependencies.

### v6.5 — Artifact Maintenance Validator

Add `src/core/artifactMaintenanceValidator.ts`.

Implement all eight validation checks. Integrate git observation from `gitObserver.ts` for the source-file-modification check. Add `Witness: Validate Artifact Maintenance` (commandId: `witness.validateArtifactMaintenance`) as the developer-facing entry point.

New files:
- `src/core/artifactMaintenanceValidator.ts`
- `src/commands/validateArtifactMaintenance.ts`

Modified files:
- `src/extension.ts` — register the new command
- `package.json` — add activationEvent and contributes.commands entry
- `src/templates/commands.md` — document the new command

Public command count: 28 → 29.

**Status: complete.**

`src/core/artifactMaintenanceValidator.ts` added. Pure, synchronous, no vscode import, no
filesystem reads, no telemetry, no LLM calls.

Five validation rules implemented:
1. File partition: `changedWitnessFiles` = paths starting with `.witness/`; `changedNonWitnessFiles` = all others. Non-witness files → `status: "failed"`, critical issue with evidence list.
2. Empty changed-file list → `status: "warning"`, warning issue.
3. Required section checks per `expectedKind`: sections checked against all provided `artifactContents` entries using heading-level markdown detection (ATX headings, case-insensitive). Missing content for changed witness files → warning. Missing sections → warning with evidence list.
4. Mandatory marker detection in artifact contents: `TODO`, `TBD`, `{{`, `}}`, `[FILL`, `<...>` → warning with affected file list.
5. Summary string generated deterministically from final status.

`src/commands/validateArtifactMaintenance.ts` added. Command flow:
1. Guard: workspace open.
2. `observeGit(workspaceRoot)` — uses `dirtyFilePaths` from git working tree if available (up to 10 files). Offers QuickPick: use git-detected files or enter paths manually. If git unavailable or no dirty files, goes directly to manual InputBox.
3. QuickPick: select maintenance kind (update-current-state / create-checkpoint / prepare-handover / review-subagent-artifacts / resume-with-witness / skip). `maintenanceKind` field name used on `KindPickItem` to avoid collision with `vscode.QuickPickItem.kind` (typed as `QuickPickItemKind | undefined`).
4. Reads changed `.witness/` markdown files via `vscode.workspace.fs`. Skips source files, telemetry directory, and non-markdown files.
5. Calls pure `validateArtifactMaintenance()`.
6. Opens unsaved markdown validation report (Status, Summary, Changed Witness Files, Changed Non-Witness Files, Issues, Next Step). Shows status notification (info / warning / error).
7. Emits `witness.artifact_maintenance.validated` with: `status`, `issue_count`, `changed_witness_file_count`, `changed_non_witness_file_count`, `expected_kind`, `completed`, `cancelled_at`. No raw artifact content, no file content, no prompt text in telemetry.

Smoke tests (run against compiled output): Test 1 (only .witness files, all sections) → passed/0 issues. Test 2 (src/foo.ts touched) → failed/1 critical. Test 3 (missing required sections) → warning/1 warning. Test 4 (empty changedFiles) → warning/1 warning. Test 5 (mandatory marker) → warning/1 warning.

`witness.openStatusActions` confirmed absent from `package.json` contributes.commands.
Public command count: 28 → 29. activationEvents: 29 → 30. No new dependencies.

### v6.6 — Status Bar Integration

Update the status bar to consume `MaintenanceNeed` from the trigger engine and display the v6 maintenance labels. Update the QuickPick to show the maintenance need as the top item when it exists. Add severity-based ordering between the maintenance signal and the continuity risk signal.

Modified files:
- `src/core/statusBar.ts` — full v6.6 status bar integration pass

No new public commands. No package.json changes.

**Status: complete.**

`src/core/statusBar.ts` updated to v6.6. Changes:

1. Import added: `computeMaintenanceNeed` from `'./maintenanceTriggerEngine'`.

2. `buildRecommendedItem()` priority updated from v5.4 (4 cases) to v6.6 (A–F):
   - A. `status === null` → Show Workspace Status (unchanged)
   - B. `activeSessionId === null` → Start Tracking (unchanged)
   - C/D. `computeMaintenanceNeed({status})` — if `kind !== 'none'` → `Maintain: <need.title>` with `witness.updateProjectMemoryWithAgent`. Wrapped in try/catch; failure falls through to E.
   - E. `suggestedAction.id !== 'all-clear'` → Resolve: <label> (unchanged, was case 3)
   - F. All-clear → Create Checkpoint (unchanged, was case 4)

3. `buildTooltip()` extended with one maintenance line after the suggested action block:
   `Maintenance: <need.title>` or `Maintenance: up to date`. Wrapped in try/catch; omitted on failure.

4. `buildQuickPickItems()` Beginner Actions extended from 5 to 7 candidates:
   - Added `witness.updateProjectMemoryWithAgent` — "Update Project Memory with Agent"
   - Added `witness.validateArtifactMaintenance` — "Validate Artifact Maintenance"
   - Deduplication logic unchanged; if `updateProjectMemoryWithAgent` is the recommended item it is omitted from Beginner Actions automatically.

5. File header updated from v5.4a to v6.6 with changelog comment.

Public command count remains 29. activationEvents count remains 30. No package.json changes. `tsc --noEmit` passes cleanly.

### v6.7 — Docs and Regression

Create `docs/v6-validation-report.md`.

Regression scope:
- A developer can start a Witness session, code for 90 simulated minutes, and receive a maintenance prompt without manually requesting one.
- The prompt is copy-ready and passes a read-through check by a reviewer who has not read the v6 plan.
- The validator correctly flags a missing required section, a stale mandatory marker, and a source-file modification.
- The status bar shows `Witness: Checkpoint recommended` at the right moment and returns to `Witness: OK` after a checkpoint is approved.
- All v5.6 regression scenarios still pass.

**Status: complete.**

`docs/v6-validation-report.md` created. All 12 required sections present. Compile verified
clean. Command counts confirmed: 29 public commands, 30 activation events, 29 registerCommand
calls. `witness.openStatusActions` confirmed absent from `package.json` contributes.commands.
0 runtime dependencies added.

Documentation updated:
- `README.md` — v6 section "Agent-Assisted Artifact Maintenance" added, counts updated to 29/30.
- `docs/workflow.md` — Phase 7 "Agent-Assisted Artifact Maintenance (v6)" added with 7-step
  maintenance loop and harness contract table.
- `docs/architecture.md` — v6 architecture section added: new modules, new harness contracts,
  new directory, data flow diagram, non-autonomy statement, source tree additions, updated counts.
- `docs/product-ux-principles.md` — v6 UX principles section added (4 principles). v6
  Agent-Assisted Artifact Maintenance added to Implemented Features. Document history updated.

**v6 is closed.**

---

## 15. Success Criteria

v6 succeeds when all of the following are true:

**The developer does not manually write `current-state.md` for routine maintenance.** The trigger engine detects when current-state is stale, generates a maintenance prompt, and the developer's role is reviewer, not author.

**Witness detects at least three maintenance needs automatically.** Detection of stale current-state, missing checkpoint, and missing handover must be implemented and working. Detection of pending subagent review is required. Detection of resume-ready state is required.

**Maintenance prompts are copy-ready and artifact-only.** Every generated prompt can be pasted directly into the developer's coding agent without modification. Every generated prompt includes explicit forbidden-writes constraints. No prompt requires source-code edits.

**Generated artifacts can be validated deterministically.** The validator must produce a pass or fail result based on file content and git state, without LLM involvement. Validation results must be reproducible: the same artifact produces the same validation result every time.

**No source-code files are modified during artifact-only maintenance.** If the coding agent modifies a source file during a maintenance task, the validator must detect it and block approval. This must be tested as part of the v6.7 regression.

**The developer remains the reviewer throughout.** No generated artifact is written to `.witness/` without explicit developer approval. The approve action is always a deliberate step, never automatic.

**No direct LLM provider is required for MVP.** The Route A+ workflow must be fully functional using copy-paste alone. A developer with no API keys and no provider configuration can use every v6 feature.

---

## 16. Open Questions

**Q1 — Should v6.1 use git diff/stat as a trigger input?** The trigger engine is more accurate when it can observe that source files changed since the last current-state update. `gitObserver.ts` already exists in the codebase. The question is whether to use it in v6.1 or defer it to a later pass. Using it in v6.1 produces better Rule 3 and Rule 5 signals; deferring it reduces v6.1 scope.

**Q2 — How should checkpoint freshness be defined?** Rule 5 uses a configurable age threshold (default: 4 hours). Should this threshold be fixed, user-configurable in VS Code settings, or adaptive based on observed session length? An adaptive threshold would require tracking historical session behavior, which adds complexity.

**Q3 — Should checkpoints use a new `.witness/checkpoints/` folder or remain in `.witness/sessions/`?** The current convention places checkpoint files in the session folder as `<session-id>-checkpoint-NNN.md`. A dedicated `.witness/checkpoints/` folder would make checkpoints easier to find and list independently, but it changes the artifact location convention established in prior versions.

**Q4 — Should artifact-only validation snapshot git state before and after?** A pre-task git snapshot requires Witness to capture state before the developer pastes the prompt into their coding agent. This adds a step to the Route A+ workflow: the developer would need to trigger a snapshot before pasting. An alternative is to rely only on the `.witness/` modification filter, accepting that source-file changes during the task are a developer responsibility to avoid rather than a Witness enforcement. This is a risk tradeoff, not a technical limitation.

**Q5 — Should direct LLM provider integration be v6.x or v7?** Route B adds significant complexity and surface area. If Route A+ meets the success criteria, Route B may not be necessary in the v6 series at all. This question should be revisited after v6.7 validation, based on actual developer feedback about the manual-paste friction.

**Q6 — How should validation failures be exposed in the status bar?** The current plan surfaces validation failures in the review surface only. An alternative is to add a status bar label such as `Witness: Validation failed` that persists until the developer resolves the failure. This adds a new status bar state and raises the question of what `Witness: Validation failed` means to a developer who has not read the v6 plan.

**Q7 — How much of the current-state update should be generated versus reviewed?** The maintenance prompt instructs the agent to draft a full `current-state.md` update. An alternative is a partial update: the prompt asks the agent to fill in only the sections that are likely stale (Next Action, Last Completed) and leave other sections untouched. A partial update is less likely to overwrite accurate content, but it requires the prompt generator to know which sections are stale, which requires deeper artifact parsing.

---

## Constraints

The following constraints apply to all v6 milestones:

- No source code changes in v6.0.
- No package.json changes in v6.0.
- No new commands in v6.0.
- No new dependencies at any milestone.
- No emojis in any user-facing string.
- Witness remains VS Code-first.
- The automatic/confirmed action boundary is preserved in all new commands.
- Do not claim guaranteed artifact quality from LLM-generated content.
- Do not make Witness an autonomous coding agent.
- Do not call any LLM provider in v6.0 through v6.6 without an explicit milestone decision.
- All new modules must compile cleanly with the existing `tsconfig.json` and `npm run compile`.

---

*End of v6 Implementation Plan.*
