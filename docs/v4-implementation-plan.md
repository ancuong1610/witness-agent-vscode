# Witness Agent — v4 Implementation Plan

**Status**: v4.6 implemented and compile-validated (2026-05-18). 23 public commands. 24 activationEvents.
v4.0 plan accepted and cleaned. v4.1 implemented and compile-validated (2026-05-15).
v4.2 implemented and compile-validated (2026-05-15). UX patch applied (2026-05-16): pre-action
notification replaced with unsaved markdown tab; three-button flow removed; QuickPick presented
directly. `witness.resolveContinuityIssue` command live. 23 public commands.
v4.3 implemented and compile-validated (2026-05-16): resolver item integrated into status bar
QuickPick. `witness.openStatusActions` remains internal only.
v4.4 implemented and compile-validated (2026-05-16): subagent plan builders updated with
per-entry artifact navigation and stage-aware primary action routing.
Activation hotfix applied (2026-05-16): `workspaceContains:.witness/index.md` added as first
activationEvent. 24 activationEvents total.
v4.5 documentation closeout completed (2026-05-18): README, architecture, workflow, product-ux-principles,
v4-implementation-plan all updated. v4-validation-report.md created. Final compile: PASS.
v4.6 Agent Harness Pack implemented (2026-05-18): .witness/AGENTS.md and .witness/harness/
created during Witness: Initialize Project. No new public commands. No API integration.
Templates: src/templates/AGENTS.md + src/templates/harness/ (4 files). Source changes:
witnessPaths.ts (add 'harness' subdir), templates.ts (add AGENTS_ROOT_FILE, HARNESS_TEMPLATE_FILES,
loadHarnessTemplate), initProject.ts (steps 9-10, updated .gitkeep exclusion, updated telemetry).
v4.7 Generic Orchestrator Harness Guide implemented (2026-05-18): .witness/harness/orchestrator.md
added to Agent Harness Pack. Guides orchestrator-style workflows on No Ledger / Lightweight Ledger /
Full Ledger selection. Includes delegation checklist, multi-subagent policy, failure policy,
context minimization, and 4 example prompts. No new public commands. No API integration.
Source change: src/templates/harness/orchestrator.md added; 'orchestrator.md' added to
HARNESS_TEMPLATE_FILES (5 entries total); src/templates/AGENTS.md updated to reference it.
**Prerequisite**: v3 is complete and closed. 22 public commands at v3 close. `witness.openStatusActions`
remains internal. UX principle and automatic/confirmed boundary locked in `docs/product-ux-principles.md`.

---

## 1. v4 Summary

v3 turned Witness from a manual command palette system into a background continuity guidance
layer. v3 observes the `.witness/` artifact set, classifies the workspace health, and surfaces the
most relevant next action via the status bar and the suggested actions engine. The developer sees
the warning label. The developer must still know which command to run, navigate to the right
artifact, interpret the internal risk model, and decide what to do. v3 surfaces the signal;
the developer carries the translation burden.

v4 closes that gap. v4 takes the top continuity issue that v3 already detected and translates it
into plain developer language: what happened, why it matters, what to do next, and what evidence
Witness used to reach that conclusion. v4 then guides the developer through resolving that single
issue in one interaction — opening the relevant artifact, presenting the options, and routing the
developer to an existing command that records the chosen decision.

v4 does not invent new issue types. Every issue v4 resolves corresponds to a risk signal already
computed by `src/core/suggestedActions.ts`. v4 adds the translation and the resolution scaffolding.
v4 does not add a second layer of intelligence. It adds a second layer of usability on top of the
intelligence v3 already provides.

v3 detected and suggested. v4 translates and guides.

The developer should not need to understand the internal five-dimension risk model, remember which
command addresses which issue, or manually navigate to the relevant artifact. v4 makes the
resolution path visible and executable from a single entry point: `Witness: Resolve Continuity
Issue`.

v4 adds no LLM inference, no autonomous decisions, no automatic artifact writes, no raw transcript
capture, and no hidden reasoning. All logic is deterministic. All writes require explicit developer
confirmation.

---

## 2. Goals

The following capabilities are in scope for v4.

**One focused resolver command.** A new command, `Witness: Resolve Continuity Issue`, that reads
the current `WitnessWorkspaceStatus`, identifies the top-priority continuity issue, translates it
into developer-friendly language, and guides the developer through the appropriate resolution
sequence. The command is the only new entry point. It does not require the developer to know the
internal risk model or manually select from a list of unrelated commands.

**Status bar integration.** The existing status bar item gains a first-class "Resolve issue" entry
in its QuickPick when the suggested action severity is `warning` or `critical`. This is the
expected discovery path: the developer sees the status bar label change, clicks it, and selects
"Resolve issue" to launch the resolver. The status bar item itself does not change its label set;
only its QuickPick content is updated.

**Issue-specific resolution flows.** The resolver produces a `ContinuityResolutionPlan` tailored
to the active issue kind. Each plan specifies a primary action and optional secondary actions,
drawn entirely from existing Witness commands and artifact navigation. The resolution flow for a
blocked subagent differs from the flow for a stale handover, which differs from the flow for a
missing context packet. Each flow is scoped to that issue and does not bleed into unrelated areas.

**Artifact opening and navigation.** Each resolution flow opens the relevant artifact in the VS
Code editor before presenting the action QuickPick. The developer reads the artifact in its full
context before choosing a resolution. Witness never resolves without showing the developer what it
found.

**Reuse of existing commands.** The resolver's action steps invoke existing v1, v2, and v3
commands via `vscode.commands.executeCommand`. v4 does not reimplement artifact writing logic.
Every write that v4 causes passes through an already-validated command with its existing
confirmation gates.

**No autonomous decisions.** The resolver presents options. The developer chooses. If the
developer closes the QuickPick without selecting, nothing is written. If the developer selects
"Do nothing", nothing is written. The resolver is a navigation and scaffolding helper, not a
decision-making agent.

**Developer-friendly risk translation.** The five internal risk dimensions (`Active Context
Pressure`, `Artifact Externalization Gap`, `Subagent Boundary Risk`, `Quality Drift`,
`Phase Boundary Risk`) remain internal implementation details. Every resolver output expresses the
issue in plain language a developer working on an AI-assisted task will immediately recognize —
without needing to study the risk model or the Witness documentation.

**Clear evidence shown for each resolver output.** Every `ContinuityResolutionPlan` includes an
`evidence` array that lists the specific `.witness/` artifacts, fields, age values, and health
levels that led to the current issue classification. The developer can see exactly what Witness
measured and verify it before acting.

---

## 3. Non-Goals

The following are explicitly out of scope for v4.

**No autonomous subagent retry.** v4 does not re-invoke, restart, or requeue a blocked subagent.
Subagent orchestration is always the developer's decision.

**No automatic current-state rewrite.** v4 does not modify `current-state.md` without explicit
developer confirmation of a command that writes to it. The resolver may suggest `Witness: Compress
Current State`, but it does not execute it without the developer selecting that action.

**No automatic handover generation.** v4 does not generate a handover as a side effect of
resolution. The resolver may surface `Witness: Generate Handover` as an action option, but the
developer must explicitly select it and confirm the resulting command prompt.

**No automatic subagent review.** The resolver may open a subagent's `evidence.md` and suggest
`Witness: Review Subagent Task`, but it does not write a `review.md` without the developer
choosing the review decision in the existing review command's QuickPick.

**No automatic session switching.** The resolver may include `Witness: Prepare Session Switch`
or `Witness: Resume Session` as secondary action options, but it does not change the active
session ID, create a new session, or close any open files.

**No automatic coding-agent context injection.** The resolver does not push any artifact content
into a coding agent session, clipboard, or prompt without explicit developer selection of that
action.

**No LLM calls.** The `ContinuityResolutionPlan` is computed entirely from `WitnessWorkspaceStatus`
fields and the `ContinuityIssueKind` classification. No language model is invoked. The
`whatHappened`, `whyItMatters`, and `whatToDoNext` fields are pre-authored strings parameterized
by artifact names and ages — they are not generated by inference.

**No raw transcript capture.** v4 does not read, process, or store any chat transcript from any
coding agent. No Copilot chat, Claude chat, or other agent conversation data is accessed.

**No hidden reasoning capture.** v4 does not capture or store internal chain-of-thought, model
reasoning, or intermediate inference outputs of any kind.

**No full dashboard or webview.** v4 uses the existing status bar QuickPick and the VS Code
editor for artifact display. A full webview panel is deferred past v4.

---

## 4. Developer-Friendly Risk Translation

### Why this section is required

The five-dimension risk model (Active Context Pressure, Artifact Externalization Gap, Subagent
Boundary Risk, Quality Drift, Phase Boundary Risk) is an implementation model. It was designed to
be precise, not legible to a developer who is in the middle of a coding session and just saw
`Witness: Attention` appear in the status bar.

v4's job is translation. The five dimensions remain stable as the internal classification substrate.
v4 maps them to developer-facing issues that use the language of the developer's actual task —
not the language of the risk model.

### Internal-to-developer translation table

| Internal Dimension | Developer-Facing Issue |
|--------------------|------------------------|
| Active Context Pressure | Checkpoint recommended — current state may be stale or uncompressed |
| Artifact Externalization Gap | Project state not written down — no current-state or handover artifact |
| Subagent Boundary Risk | Subagent work needs review — open ledger entries with no review decision |
| Quality Drift | Validation or consistency issue — handover or context packet may be incomplete |
| Phase Boundary Risk | Session switch preparation incomplete — transition artifacts are missing or stale |

Each `ContinuityIssueKind` maps to one or more of these developer-facing issues. The mapping is
one-directional: developer-facing issues are derived from internal classifications; internal
dimension names are never shown in the VS Code UI.

### Resolver output rule

Every `ContinuityResolutionPlan` produced by `src/core/continuityResolver.ts` must answer four
questions for the developer:

1. **What happened?** — A single sentence describing the observable state Witness found.
   Example: "Your current-state.md has not been updated in 3 hours and 12 minutes."

2. **Why does it matter?** — A single sentence explaining the continuity risk in terms of
   developer impact, not internal model terminology.
   Example: "If you switch sessions now, the next session will start without an accurate record
   of where the project stands."

3. **What should I do next?** — A concrete, actionable instruction naming the specific artifact
   or command the developer should use.
   Example: "Run Witness: Compress Current State to archive the current snapshot and open the
   file for manual trimming and refresh."

4. **What evidence did Witness use?** — A list of the specific artifact paths, field values, and
   age measurements that Witness read to reach this conclusion.
   Example: `[".witness/current-state.md (age: 192 minutes)", "stale threshold: 120 minutes"]`

This rule applies to:
- Every `ContinuityResolutionPlan` produced by `continuityResolver.ts`
- Every resolver QuickPick description shown to the developer
- Every issue-specific resolver added in future v4 milestones

The four-field structure (`whatHappened`, `whyItMatters`, `whatToDoNext`, `evidence`) is encoded
directly in the `ContinuityResolutionPlan` interface (see Section 5). It is not optional. A plan
with a missing or empty `whatHappened`, `whyItMatters`, or `whatToDoNext` field is invalid and
must not be presented to the developer.

---

## 5. Proposed v4 Modules

v4 adds the following source files. No existing files are modified in v4.0 planning. All module
paths are relative to the project root. This section defines types and module purposes. It does
not define implementation details beyond what is needed to plan the milestone sequence.

### `src/core/continuityResolver.ts`

**Purpose**: Take a `WitnessWorkspaceStatus` record (produced by the existing
`src/core/workspaceStatus.ts`) and produce a `ContinuityResolutionPlan` for the current top-
priority issue. The resolver does not perform its own filesystem reads. It operates on the
already-computed status record. It does not call any LLM.

**Issue kind classification**: The resolver maps the `suggestedAction.id` from the
`WitnessWorkspaceStatus` record to a `ContinuityIssueKind`. The issue kind determines which
pre-authored resolution plan template is used. The mapping is deterministic and one-to-one where
possible; compound mappings (multiple suggested action IDs that share a resolution flow) are
documented as constants in the module. The resolver uses `suggestedAction.id` for classification
only; it does not pass through `suggestedAction.commandId`.

**Resolution plan construction**: For each `ContinuityIssueKind`, the resolver constructs a
`ContinuityResolutionPlan` by parameterizing a pre-authored template with artifact names, ages,
counts, and paths drawn from the `WitnessWorkspaceStatus` record. The `whatHappened`,
`whyItMatters`, and `whatToDoNext` strings are template strings, not generated text.

**Type definitions** (planning-level; implementation may add helper methods or adjust for VS Code
URI compatibility):

```ts
type ContinuityIssueKind =
  | "no-witness-project"
  | "no-active-session"
  | "blocked-subagent"
  | "red-risk"
  | "orange-risk"
  | "pending-subagent-review"
  | "loop-risk-subagent"
  | "incomplete-subagent-ledger"
  | "stale-current-state"
  | "missing-current-state"
  | "missing-context-packet"
  | "stale-handover"
  | "context-packet-markers"
  | "telemetry-not-active"
  | "all-clear";

interface ContinuityResolutionPlan {
  issueKind: ContinuityIssueKind;
  title: string;
  whatHappened: string;
  whyItMatters: string;
  whatToDoNext: string;
  evidence: string[];
  severity: "info" | "warning" | "critical";
  primaryAction: ContinuityResolutionAction | null;
  secondaryActions: ContinuityResolutionAction[];
  artifactPaths: string[];
}

interface ContinuityResolutionAction {
  label: string;
  commandId?: string;
  description: string;
  requiresConfirmation: boolean;
}
```

**`artifactPaths`**: A list of `.witness/`-relative file paths that should be opened in the
editor before the resolution QuickPick is presented. For most issue kinds, this is a single
file (e.g., the subagent's `evidence.md`, the pending `handover-latest.md`, or the stale
`current-state.md`). For `all-clear`, this list is empty.

**`primaryAction`**: The single most important next step. This is the action the resolver
presents as the default selection in the QuickPick. It may be null for informational issues
(e.g., `telemetry-not-active`) where there is no single obvious command. If `commandId` is
present, selecting the action executes the command. If absent, the action is informational only.

**`secondaryActions`**: A list of two to four additional options always appended to the
resolution QuickPick. For all issue kinds, the fixed secondary actions include at minimum:
- "Do nothing — mark as seen" (no commandId; closes the resolver without writing anything)
- "Show Workspace Status" (`witness.showWorkspaceStatus`)

**Module exports**:

```ts
function resolveTopIssue(status: WitnessWorkspaceStatus): ContinuityResolutionPlan;
```

The function is synchronous. It takes the already-computed `WitnessWorkspaceStatus` and returns
a fully populated `ContinuityResolutionPlan`. It must not throw; for any unrecognized or
unmapped `suggestedAction.id`, it falls back to the `all-clear` plan.

---

### `src/commands/resolveContinuityIssue.ts`

**Purpose**: Implement the `Witness: Resolve Continuity Issue` command. This module is the
only v4 command. It orchestrates: computing the workspace status, calling `resolveTopIssue`,
opening the relevant artifacts, presenting the resolution QuickPick, and dispatching the
selected action.

**Command ID**: `witness.resolveContinuityIssue`

**Behavior**:

1. Guard: if no workspace is open, show an error and return.
2. Guard: if `.witness/` does not exist, show an informative message and suggest
   `Witness: Initialize Project`. Return.
3. Call `computeWorkspaceStatus` to obtain a fresh `WitnessWorkspaceStatus`.
4. Call `resolveTopIssue(status)` to obtain the `ContinuityResolutionPlan`.
5. If `issueKind` is `all-clear`, show an information message:
   "No continuity issues found. Workspace looks healthy." and return.
6. For each path in `plan.artifactPaths`: open the file in a VS Code editor tab using
   `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument`. If a file does
   not exist, skip it and add a note to the plan's evidence display.
7. Present the resolution QuickPick. The QuickPick header shows `plan.title`. Each item
   shows the action label and its description (answering the four resolver output rule questions
   in aggregate). The primary action is listed first. Secondary actions follow. A separator
   divides primary from secondary.
8. If the developer dismisses the QuickPick without selecting, return without writing anything.
9. If the developer selects an action with a `commandId`, execute
   `vscode.commands.executeCommand(action.commandId)`. If `requiresConfirmation` is true,
   the inner command's own confirmation prompts govern the write boundary.
10. If the developer selects an action without a `commandId` (informational or "Do nothing"),
    return without writing anything.
11. Emit a telemetry event: `witness.continuity_resolver.action_selected` with attributes:
    `issue_kind`, `severity`, `action_label`, `was_primary` (boolean), and
    `artifact_paths_opened` (count).

**The resolver never writes to `.witness/` directly.** All writes pass through existing commands.

---

## 6. Issue-Specific Resolution Flows

This section defines the `ContinuityResolutionPlan` content and action set for each
`ContinuityIssueKind`. The `whatHappened`, `whyItMatters`, and `whatToDoNext` strings below are
planning-level templates; the implementation parameterizes them with runtime values from the
`WitnessWorkspaceStatus` record (e.g., actual age in minutes, actual file name).

### `no-witness-project`

| Field | Content |
|-------|---------|
| `title` | "Witness Project Not Initialized" |
| `whatHappened` | "This workspace does not have a `.witness/` directory." |
| `whyItMatters` | "Witness cannot track continuity until the project is initialized." |
| `whatToDoNext` | "Run `Witness: Initialize Project` to set up the `.witness/` structure." |
| `primaryAction` | commandId: `witness.initProject`, label: "Initialize Project" |
| `artifactPaths` | `[]` |

### `no-active-session`

| Field | Content |
|-------|---------|
| `title` | "No Active Session" |
| `whatHappened` | "No session is currently active." |
| `whyItMatters` | "Most Witness commands require an active session to associate artifacts with a session ID." |
| `whatToDoNext` | "Run `Witness: Start Session` to begin a session, or `Witness: Resume Session` if you are continuing prior work." |
| `primaryAction` | commandId: `witness.startSession`, label: "Start Session" |
| `secondaryActions` | `witness.resumeSession` — "Resume a prior session from its context packet" |
| `artifactPaths` | `[]` |

### `blocked-subagent`

| Field | Content |
|-------|---------|
| `title` | "Subagent Blocked or Failed" |
| `whatHappened` | "`{N}` subagent(s) reported a blocked or failed status." |
| `whyItMatters` | "A blocked subagent means delegated work has stopped. The task outcome is unknown until you review the report and decide whether to retry, close, or re-delegate." |
| `whatToDoNext` | "Open the blocked subagent's report or evidence file, review what it found, and decide how to proceed." |
| `primaryAction` | commandId: `witness.reviewSubagentTask`, label: "Review Blocked Subagent Report" |
| `artifactPaths` | Paths to `evidence.md` for each blocked ledger entry (up to 3; if more, show count) |

### `red-risk`

| Field | Content |
|-------|---------|
| `title` | "Red Continuity Risk — Handover Needed" |
| `whatHappened` | "The latest risk assessment is RED (or BLOCKED) and your handover is `{age}` minutes old or absent." |
| `whyItMatters` | "A RED risk without a fresh handover means the project's continuity record does not reflect the current state of risk. If you switch sessions now, the next session starts with an incomplete picture." |
| `whatToDoNext` | "Generate a fresh handover that captures the current state and the active risk. Then validate it and create a context packet." |
| `primaryAction` | commandId: `witness.generateHandover`, label: "Generate Handover" |
| `secondaryActions` | `witness.assessRisk` — "Re-assess risk first"; `witness.prepareSessionSwitch` — "Full session switch preparation" |
| `artifactPaths` | Path to the latest risk assessment file |

### `orange-risk`

| Field | Content |
|-------|---------|
| `title` | "Orange Continuity Risk" |
| `whatHappened` | "The latest risk assessment is ORANGE and your handover is `{age}` minutes old or absent." |
| `whyItMatters` | "An ORANGE risk indicates an elevated but not critical continuity gap. A fresh handover is recommended before further session work." |
| `whatToDoNext` | "Review the risk assessment and generate a handover if you are approaching a session transition." |
| `primaryAction` | commandId: `witness.generateHandover`, label: "Generate Handover" |
| `secondaryActions` | `witness.assessRisk` — "Re-assess risk to check if it has changed" |
| `artifactPaths` | Path to the latest risk assessment file |

### `pending-subagent-review`

| Field | Content |
|-------|---------|
| `title` | "Subagent Task Needs Review" |
| `whatHappened` | "`{N}` subagent task(s) have a completion report but no review decision." |
| `whyItMatters` | "Unreviewed subagent tasks mean the orchestrator loop is open. The work exists but has not been accepted, rejected, or flagged for follow-up." |
| `whatToDoNext` | "Open the subagent's evidence and report files, review the task outcome, and record your review decision." |
| `primaryAction` | commandId: `witness.reviewSubagentTask`, label: "Review Subagent Task" |
| `artifactPaths` | Paths to `report.md` and `evidence.md` for the oldest pending ledger entry |

### `loop-risk-subagent`

| Field | Content |
|-------|---------|
| `title` | "Subagent May Be Looping or Stalled" |
| `whatHappened` | "`{N}` subagent(s) have evidence files older than `{threshold}` minutes with no completion report." |
| `whyItMatters` | "A subagent that produces evidence but no report may have stalled, looped, or exited silently. This leaves the orchestrator loop open without a clear outcome." |
| `whatToDoNext` | "Review the evidence file to understand what the subagent produced, then decide whether to close the task, retry, or re-delegate." |
| `primaryAction` | commandId: `witness.reviewSubagentTask`, label: "Review Stalled Subagent Evidence" |
| `artifactPaths` | Paths to `evidence.md` for the loop-risk ledger entries (up to 3) |

### `incomplete-subagent-ledger`

| Field | Content |
|-------|---------|
| `title` | "Subagent Task Not Completed" |
| `whatHappened` | "`{N}` subagent ledger(s) are incomplete — a contract exists but one or more required stage files are missing." |
| `whyItMatters` | "A task was dispatched but has not been formally completed. The outcome is unknown to the orchestrator and the orchestrator loop remains open." |
| `whatToDoNext` | "Open the ledger entry and check which stage files are present. The correct next command depends on what is missing: if `evidence.md` is absent, run `Witness: Record Subagent Evidence`; if `evidence.md` exists but `report.md` is absent, run `Witness: Complete Subagent Task`; if `report.md` exists but `review.md` is absent, run `Witness: Review Subagent Task`. Run `Witness: Show Workspace Status` to see the per-entry health breakdown." |
| `primaryAction` | commandId: `witness.showWorkspaceStatus`, label: "Show Workspace Status (see per-entry health)" |
| `secondaryActions` | `witness.recordSubagentEvidence` — "Record evidence when evidence.md is missing"; `witness.completeSubagentTask` — "Write report when evidence exists but report is missing"; `witness.reviewSubagentTask` — "Review when report exists but review decision is missing" |
| `artifactPaths` | Paths to `contract.md` for the oldest incomplete ledger entry |

**Implementation note for v4.1**: The `WitnessWorkspaceStatus` record provides aggregate counts
(`incompleteSubagentLedgers`, `pendingSubagentReviews`) but not per-entry stage detail. The
`incomplete-subagent-ledger` resolver therefore uses `witness.showWorkspaceStatus` as its primary
action to surface the detailed per-entry health table (added in v3.2), from which the developer
can identify the missing stage and select the appropriate secondary action. A future milestone may
extend `WitnessWorkspaceStatus` to carry the oldest incomplete entry's stage bitmap, enabling the
resolver to pre-select a more specific primary action without requiring the developer to consult
the status view first.

### `stale-current-state`

| Field | Content |
|-------|---------|
| `title` | "Current State Is Stale — Checkpoint Recommended" |
| `whatHappened` | "`current-state.md` has not been updated in `{age}` minutes (threshold: `{threshold}` minutes)." |
| `whyItMatters` | "The current state file is the primary record of where the project stands. A stale file means the next session resume or handover generation will start from an outdated snapshot." |
| `whatToDoNext` | "Run `Witness: Compress Current State` to archive the current snapshot to a dated session file and open `current-state.md` for manual trimming and refresh." |
| `primaryAction` | commandId: `witness.compressState`, label: "Compress Current State" |
| `artifactPaths` | `[".witness/current-state.md"]` |

### `missing-current-state`

| Field | Content |
|-------|---------|
| `title` | "No Current State File" |
| `whatHappened` | "`current-state.md` does not exist in this workspace." |
| `whyItMatters` | "Without a current state file, there is no written record of the project's present position. Session handovers and context packets depend on this file." |
| `whatToDoNext` | "Check `.witness/sessions/` for a prior session snapshot (e.g. `<session-id>-current-state-NNN.md`) and restore its content manually. If no prior snapshot exists, run `Witness: Initialize Project` — this restores the `current-state.md` template without overwriting other artifacts, but should be used carefully as it re-runs initialization logic." |
| `primaryAction` | commandId: `witness.showWorkspaceStatus`, label: "Show Workspace Status" |
| `secondaryActions` | `witness.initProject` — "Restore `current-state.md` template (re-runs initialization — use carefully)" |
| `artifactPaths` | `[]` |

### `missing-context-packet`

| Field | Content |
|-------|---------|
| `title` | "No Context Packet for This Session" |
| `whatHappened` | "A handover exists but no context packet has been created for this session." |
| `whyItMatters` | "A context packet assembles the handover, current state, and open threads into a single file for session resume. Without it, resuming this session requires manually locating multiple artifacts." |
| `whatToDoNext` | "Run `Witness: Create Context Packet` to assemble the resume artifact." |
| `primaryAction` | commandId: `witness.createContextPacket`, label: "Create Context Packet" |
| `artifactPaths` | `[".witness/handovers/latest.md"]` |

### `stale-handover`

| Field | Content |
|-------|---------|
| `title` | "Handover Is Stale" |
| `whatHappened` | "`handovers/latest.md` has not been updated in `{age}` minutes (threshold: `{threshold}` minutes)." |
| `whyItMatters` | "A stale handover means the continuity record does not reflect recent progress. If the session ends now, the next session starts from an outdated record." |
| `whatToDoNext` | "Run `Witness: Generate Handover` to refresh the handover with the current session state." |
| `primaryAction` | commandId: `witness.generateHandover`, label: "Generate Handover" |
| `artifactPaths` | `[".witness/handovers/latest.md"]` |

### `context-packet-markers`

| Field | Content |
|-------|---------|
| `title` | "Context Packet Has Unfilled Placeholders" |
| `whatHappened` | "The most recent context packet contains mandatory placeholder markers (`{{`, `TODO`, `MANDATORY`, `[MISSING`, or `<fill`)." |
| `whyItMatters` | "An unfilled context packet will confuse or mislead a coding agent that tries to use it for session resume. Placeholders signal that the packet was generated but not completed." |
| `whatToDoNext` | "Open the context packet file, fill in the marked sections, and save." |
| `primaryAction` | null (artifact review only — no command automates fill-in) |
| `secondaryActions` | `witness.createContextPacket` — "Regenerate the context packet from scratch" |
| `artifactPaths` | Path to the most recent context packet file |

### `telemetry-not-active`

| Field | Content |
|-------|---------|
| `title` | "Telemetry Not Active" |
| `whatHappened` | "No telemetry events file was found in `.witness/telemetry/`." |
| `whyItMatters` | "Telemetry events are used by the Evaluation Summary command and by the workspace status scanner. Without them, session-level reporting is unavailable." |
| `whatToDoNext` | "Run any Witness command — telemetry is initialized automatically on first write. If telemetry is missing after commands have been run, check that the `.witness/telemetry/` directory exists and is writable." |
| `primaryAction` | commandId: `witness.showWorkspaceStatus`, label: "Show Workspace Status (re-check)" |
| `artifactPaths` | `[]` |

### `all-clear`

| Field | Content |
|-------|---------|
| `title` | "No Continuity Issues Found" |
| `whatHappened` | "All continuity artifacts are present and within acceptable age thresholds." |
| `whyItMatters` | "Workspace continuity is healthy." |
| `whatToDoNext` | "Continue your session normally. Witness will alert you if anything changes." |
| `primaryAction` | null |
| `artifactPaths` | `[]` |

The `all-clear` plan causes the `resolveContinuityIssue` command to show an information message
and return immediately — no QuickPick is shown.

---

## 7. Status Bar Integration

v4 updates the behavior of the existing `src/core/statusBar.ts` QuickPick to include
"Resolve issue" as the first selectable item when `suggestedAction.severity` is `warning` or
`critical`. This is an additive update to the QuickPick item list; the status bar labels and
colors defined in v3 do not change.

**Updated QuickPick item set**:

When severity is `warning` or `critical`:
- `$(tools) Resolve: <suggestedAction.label>` → executes `witness.resolveContinuityIssue`
  (listed first; this is the new v4 item)
- All existing QuickPick items follow in their v3 order

When severity is `info` and action is not `all-clear`:
- The resolver item is included but labeled "Address: `<suggestedAction.label>`" to signal
  lower urgency.

When severity is `info` and action is `all-clear`:
- No resolver item is shown. The QuickPick is unchanged from v3.

The resolver item description in the QuickPick shows the `whatHappened` string from the
`ContinuityResolutionPlan` for the current top issue. This gives the developer the summary in
a single line before they enter the resolver. The description is computed by calling
`resolveTopIssue(status)` at the same time the QuickPick is constructed — not at status bar
update time, which would add compute overhead to ambient background updates.

---

## 8. Automatic / Confirmed Boundary Preservation

v4 must not cross the automatic/confirmed boundary defined in `docs/product-ux-principles.md`.
The following table confirms v4's compliance for each boundary-relevant behavior.

| Behavior | v4 classification | Compliance |
|----------|------------------|------------|
| Read `WitnessWorkspaceStatus` to determine the top issue | Automatic (observe, classify) | Compliant — no write |
| Construct `ContinuityResolutionPlan` | Automatic (classify) | Compliant — no write |
| Update status bar QuickPick with resolver item | Automatic (suggest) | Compliant — no write |
| Open artifact file in editor | Automatic (observe) | Compliant — read-only open |
| Present resolution QuickPick | Confirmed trigger point — developer must select | Compliant |
| Execute `commandId` from selected action | Confirmed — requires developer selection | Compliant; inner command carries its own confirmation gates |
| Write any `.witness/` artifact | Only via existing commands that require confirmation | Compliant — no direct writes in `continuityResolver.ts` or `resolveContinuityIssue.ts` |
| Switch active session | Not done by v4 | Compliant |
| Inject context into coding agent | Not done by v4 | Compliant |

The resolver does not modify any file. It opens files (read-only) and invokes existing commands
(which carry their own confirmation gates). The only new decision point the developer faces is
choosing a resolver action from the QuickPick — and "Do nothing" is always available.

---

## 9. Reuse of Existing Commands

The resolver's `ContinuityResolutionAction.commandId` values reference only commands that exist
in v1, v2, or v3. No new write commands are added in v4. The table below confirms the mapping.

| Action used by resolver | Existing command (version introduced) |
|------------------------|--------------------------------------|
| Initialize Project | `witness.initProject` (v1) |
| Start Session | `witness.startSession` (v1) |
| Resume Session | `witness.resumeSession` (v3.5) |
| Compress Current State | `witness.compressState` (v1) |
| Generate Handover | `witness.generateHandover` (v1) |
| Validate Handover | `witness.validateHandover` (v1) |
| Create Context Packet | `witness.createContextPacket` (v2) |
| Assess Continuity Risk | `witness.assessRisk` (v2) |
| Record Subagent Evidence | `witness.recordSubagentEvidence` (v2) |
| Complete Subagent Task | `witness.completeSubagentTask` (v2) |
| Review Subagent Task | `witness.reviewSubagentTask` (v2) |
| Show Workspace Status | `witness.showWorkspaceStatus` (v3.1) |
| Prepare Session Switch | `witness.prepareSessionSwitch` (v3.5) |

Every action in every `ContinuityResolutionPlan` must use a command ID from this table. If a
future milestone identifies a gap (a necessary action that no existing command covers), that action
must be planned in its own milestone before being added to the resolver, following the full v4
plan process. The resolver does not gain new write-capable commands silently.

---

## 10. Validation Plan

### Compile validation

`npm run compile` must exit with code 0 and zero TypeScript errors after each milestone. This is
a hard gate. No milestone is considered complete until compile passes.

### Command count check

v4 adds one new command: `witness.resolveContinuityIssue`. The total public command count
after v4 is 23. `witness.openStatusActions` remains internal and not contributed. Verify that
`package.json` `contributes.commands` array length is 23 after v4 implementation.

### Unit-level plan construction tests (fixture-based)

For each `ContinuityIssueKind`, construct a minimal `WitnessWorkspaceStatus` record that
triggers that issue kind's suggested action, call `resolveTopIssue`, and assert:
- `plan.issueKind` matches the expected value
- `plan.whatHappened` is a non-empty string
- `plan.whyItMatters` is a non-empty string
- `plan.whatToDoNext` is a non-empty string
- `plan.evidence` is a non-empty array
- `plan.severity` matches the expected value for that issue kind
- `plan.primaryAction` is non-null for all issue kinds except `all-clear` and
  `context-packet-markers`
- `plan.secondaryActions` contains "Do nothing — mark as seen" for all issue kinds except
  `all-clear`

These tests do not require a VS Code extension host if `resolveTopIssue` is written to operate
only on the plain `WitnessWorkspaceStatus` value type.

### Manual smoke tests — resolver command flow

**Blocked subagent flow**:
1. Create a v2 ledger entry with `contract.md`, `evidence.md`, and `report.md` containing
   status `blocked`. No `review.md`.
2. Run `Witness: Resolve Continuity Issue`.
3. Confirm `evidence.md` opens in a VS Code tab.
4. Confirm the QuickPick title is "Subagent Blocked or Failed".
5. Confirm the four resolver output rule fields appear in the QuickPick description area.
6. Select "Review Blocked Subagent Report". Confirm `witness.reviewSubagentTask` executes.
7. Select "Do nothing" in any inner QuickPick. Confirm no `review.md` is written.

**All-clear flow**:
1. Ensure workspace has current-state.md, a fresh handover, a fresh context packet, no pending
   reviews, and a GREEN risk level.
2. Run `Witness: Resolve Continuity Issue`.
3. Confirm the information message "No continuity issues found" appears.
4. Confirm no QuickPick is shown. Confirm no files are opened.

**Status bar integration**:
1. With a stale `current-state.md`, confirm the status bar shows `Witness: Checkpoint` or
   `Witness: Review Needed`.
2. Click the status bar item.
3. Confirm "Resolve: Refresh Current State" (or equivalent) is the first QuickPick item.
4. Confirm the item description matches the `whatHappened` string for `stale-current-state`.
5. Select the resolver item. Confirm `witness.resolveContinuityIssue` executes.

### v3 regression check

All 22 public v3 commands must continue to appear in the command palette, write artifacts to the
correct paths, emit telemetry, and exhibit no behavioral change from their v3 state. Run after
every v4 milestone.

---

## 11. Implementation Sequence

Milestones are ordered by dependency. Each milestone must compile cleanly and pass its validation
checks before the next begins.

### v4.0 — Plan lock

This document. No source changes. No `package.json` changes. Plan is accepted before v4.1 work
begins.

### v4.1 — `continuityResolver.ts` and unit-level plan construction

Implement `src/core/continuityResolver.ts` with the full `ContinuityIssueKind` type, the
`ContinuityResolutionPlan` and `ContinuityResolutionAction` interfaces, and the `resolveTopIssue`
function covering all 15 issue kinds. No command is wired at this milestone — the module is
exercised through unit fixture tests only.

Deliverables:
- New: `src/core/continuityResolver.ts`
- Updated: `docs/v4-implementation-plan.md` (status annotation)

### v4.2 — `resolveContinuityIssue` command

**Status**: Implemented and compile-validated (2026-05-15). 23 public commands.
**UX patch applied (2026-05-16)**: Replaced `showInformationMessage` pre-action notification
with an unsaved markdown tab opened via `vscode.workspace.openTextDocument({ content, language:
'markdown' })`. The four-field resolver summary (what happened, why it matters, what to do next,
evidence) is now shown in a readable editor tab via `formatResolverPreview()` rather than a
VS Code notification bubble. The three-button pre-action confirmation flow (Continue / Show
Workspace Status / Cancel) was removed — the QuickPick is presented directly after the markdown
tab opens. Telemetry attribute `resolver_preview_opened: boolean` added. All `cancelled_at`
values for action-selection paths unified to `'action-selection'`.

Implement `src/commands/resolveContinuityIssue.ts`. Register in `extension.ts`. Add to
`package.json` contributes.commands. Wire the full command flow: status computation, plan
construction, artifact opening, QuickPick presentation, action dispatch, and telemetry emission.
Compile. Run all manual smoke tests. Run v3 regression check.

Deliverables:
- New: `src/commands/resolveContinuityIssue.ts`
- Updated: `src/extension.ts` (register command)
- Updated: `package.json` (activation event, contributes.commands)
- Updated: `src/templates/commands.md` (new command listed)
- Updated: `docs/v4-implementation-plan.md` (status annotation)

### v4.3 — Status bar QuickPick integration

**Status**: Implemented and compile-validated (2026-05-16). 23 public commands unchanged.

Update `src/core/statusBar.ts` to add the "Resolve issue" QuickPick item when severity is
`warning` or `critical`. Wire `resolveTopIssue` call at QuickPick construction time. Compile.
Run status bar smoke tests. Run v3 regression check.

Implementation notes:
- Imported `resolveTopIssue` from `./continuityResolver` in `statusBar.ts`.
- Added `buildResolverItem(status)`: returns a `StatusQuickPickItem` with
  `commandId: 'witness.resolveContinuityIssue'` when `suggestedAction.id !== 'all-clear'`,
  or `null` for all-clear and null status. Uses `resolveTopIssue(status).whatHappened` as
  the item description; falls back to a generic string if the call throws.
- Label prefix: `Resolve:` for `warning`/`critical` severity; `Address:` for `info`.
- `buildQuickPickItems` now assembles: [resolver item, suggested action, deduped fixed].
- `witness.resolveContinuityIssue` is seeded into the deduplication set so it never
  appears twice even if a future suggested action rule maps to it.
- No new public commands. No telemetry emitted by this module. No automatic execution.

Deliverables:
- Updated: `src/core/statusBar.ts`
- Updated: `docs/v4-implementation-plan.md` (status annotation)

### v4.4 — Subagent resolver artifact navigation + Docs and validation

**Status**: Subagent artifact navigation implemented and compile-validated (2026-05-16).
Docs and validation closeout pending.

#### v4.4a — Subagent resolver artifact navigation (implemented 2026-05-16)

Updated `src/core/continuityResolver.ts` with per-entry data for the four subagent-related
issue kinds. No new public commands. No filesystem reads. Synchronous. Q7 lock maintained.

Implementation notes:
- Imported `SubagentHealthRecord` and `SubagentHealthLevel` from `./subagentHealth`.
- Added seven internal helper functions: `findSubagentEntry`, `hasStage`, `missingStage`,
  `formatMissingStages`, `ledgerStagePath`, `buildSubagentArtifactPaths`,
  `buildSubagentEvidence`.
- `findSubagentEntry(status, healthLevels)` selects the first matching entry by lowest
  ordinal (entries are pre-sorted ascending by `computeSubagentHealth`).
- `buildSubagentArtifactPaths` only includes file paths for stages that are actually present
  in `stagesPresent`, so `openArtifactPaths` is never asked to open a missing file.
  No directory paths returned.
- All four subagent plan builders rewritten:
  - `buildBlockedSubagentPlan`: finds first `blocked` entry; `whatHappened` names the
    entry id; artifact paths include evidence/report/review/contract where present.
  - `buildPendingSubagentReviewPlan`: finds first `needs-review` entry; `whatHappened`
    and `whatToDoNext` are entry-specific; artifact paths include report/evidence/contract.
  - `buildLoopRiskSubagentPlan`: finds first `loop-risk` entry; artifact paths include
    evidence/contract/context-packet where present.
  - `buildIncompleteSubagentLedgerPlan` (main improvement): finds first `incomplete`
    entry, falling back to `loop-risk`; uses `stagesMissing` to select stage-aware
    primary action (`witness.recordSubagentEvidence` / `witness.completeSubagentTask` /
    `witness.reviewSubagentTask` / `witness.showWorkspaceStatus`). Aggregate fallback
    retained when no ledger entry is found.
- Each builder gracefully falls back to aggregate behavior when the entry lookup returns
  null (e.g. entries array is empty or scan failed).

Deliverables:
- Updated: `src/core/continuityResolver.ts`
- Updated: `docs/v4-implementation-plan.md` (status annotation)

#### v4.4b — Docs and validation (pending)

Update `README.md` (add v4 command, resolver flow description, status bar integration note).
Update `docs/architecture.md` (add `continuityResolver.ts` to the v4 layer description).
Update `docs/workflow.md` (reference the resolver as the primary resolution entry point).
Create `docs/v4-validation-report.md` (structured validation report following the v3 pattern).
Run full v3 regression check one final time. Compile. Tag v4.

Deliverables:
- Updated: `README.md`
- Updated: `docs/architecture.md`
- Updated: `docs/workflow.md`
- New: `docs/v4-validation-report.md`
- Updated: `docs/v4-implementation-plan.md` (final status annotation)

---

## 12. Open Design Questions

The following questions are recorded for resolution before or during implementation. They do not
block plan acceptance but must be resolved before the affected milestone begins.

**Q1. Artifact open behavior when multiple artifacts are relevant.**
For `blocked-subagent` and `loop-risk-subagent`, `artifactPaths` may contain up to three entries.
Should all be opened simultaneously (multiple tabs, potentially disruptive) or should the resolver
open only the first and let the developer navigate? A controlled open (one tab, with a note that
`N` others are available) may be less disruptive. Resolution needed before v4.2.

**Q2. QuickPick description field length constraints.**
The `whatHappened` string shown in the QuickPick item description is a single sentence. VS Code
QuickPick descriptions have no enforced maximum length, but very long descriptions truncate
visually. The implementation should define a maximum character count (suggestion: 120 characters)
and truncate with an ellipsis if the parameterized string exceeds it. Resolution needed before
v4.2.

**Q3. Resolver telemetry — action not selected.**
The telemetry event `witness.continuity_resolver.action_selected` fires only when an action is
selected. Should a separate event `witness.continuity_resolver.dismissed` be emitted when the
developer opens the QuickPick and then dismisses it? This would help distinguish "developer saw
the issue and chose Do nothing" from "developer dismissed before reading". Resolution needed
before v4.2.

**Q4. `context-packet-markers` primary action.**
The current plan sets `primaryAction` to null for `context-packet-markers` because no command
automates placeholder fill-in. An alternative would be to set the primary action to
`witness.createContextPacket` (regenerate), with the description clarifying that regenerating
will overwrite the current file. This trades some artifact loss risk for a more actionable
first choice. Resolution needed before v4.1.

**Q5. Resolver QuickPick at `all-clear` — message vs. no-op.**
The current plan shows an information message for `all-clear` and returns. An alternative is to
show a minimal QuickPick with only the "Show Workspace Status" secondary action, giving the
developer a way to inspect the healthy state. The information message approach is simpler and
less intrusive. Resolution needed before v4.2.

**Q6. Status bar lazy vs. eager resolver plan construction.**
Section 7 specifies that the `whatHappened` string for the QuickPick item description is computed
by calling `resolveTopIssue(status)` at QuickPick construction time (when the developer clicks
the status bar), not at status bar update time. This is correct for reducing ambient compute.
However, it means there is a brief delay between click and QuickPick display while `resolveTopIssue`
runs. Since `resolveTopIssue` is synchronous and lightweight, this delay should be imperceptible.
Confirm this assumption during v4.3 implementation by profiling with a realistic `WitnessWorkspaceStatus`
record.

**Q7. Resolver action source — resolved/locked for v4.1.**
The resolver must use `WitnessSuggestedAction.id` only to classify the `ContinuityIssueKind`. It
must not blindly reuse `WitnessSuggestedAction.commandId` as its action. All resolver actions must
come from the issue-specific action table defined in `continuityResolver.ts`. This is necessary
because some v3 suggested actions are intentionally broad status-bar shortcuts that are not safe
or applicable in the resolver context. For example, the `capture-current-state` suggested action
carries `commandId: 'witness.compressState'`, but `compressState` requires `current-state.md` to
exist and will fail immediately for the `missing-current-state` issue kind. The resolver's own
action table for `missing-current-state` correctly routes to `witness.showWorkspaceStatus` as the
primary action instead. This decision is locked and must be enforced at code review for v4.1: any
path in `continuityResolver.ts` that reads `status.suggestedAction.commandId` and uses it
directly as a resolver action is a defect.

---

## Document Status

This document is the authoritative v4 implementation plan. v4.0 plan is under review.
No source changes have been made. Implementation begins at v4.1 after plan acceptance.

---

## Relationship to Prior Phases

| Phase | Theme | Closed |
|-------|-------|--------|
| v1 | Artifact model and command palette | Yes |
| v2 | Local telemetry, Subagent Ledger, Context Packet | Yes |
| v3 | Background continuity layer: detect and suggest | Yes |
| v4 | Focused issue resolution: translate and guide | In planning |
