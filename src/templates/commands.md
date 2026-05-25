# Witness Agent Commands

This is a cheat sheet of all Witness Agent command palette commands. Open the Command Palette
(`Cmd+Shift+P` / `Ctrl+Shift+P`) and type `Witness` to filter to these commands.

Witness Agent gives developers transparency, control, and tracing capability across sessions with
coding agents. It is not a coding agent. It does not write code, execute tasks, or communicate
with any AI backend at runtime. Telemetry written by Witness Agent is not part of the default
fresh-session read set and should not be loaded into agent context by default.

Core principle: store broadly, compress carefully, load minimally, validate resume quality.

---

## Group 0: Beginner Commands (v5.1)

These commands are the recommended starting point for new users. They wrap existing Witness
logic with plain-language names and guided messages. Advanced commands (Groups 1–8) remain fully
available and are unchanged.

A Witness session is a project work record, not a Copilot/Claude/Codex chat session.
Starting a new Witness session does not require opening a new coding-agent chat.

---

### Witness: Start with Witness

**Command ID**: `witness.startWithWitness`

One-command beginner entry point. Use this when starting with Witness in a project for the first
time or when you want the shortest path to project-memory value.

Steps:
1. If `.witness/index.md` is missing, initializes Witness using the same safe write-if-missing
   project setup logic as the existing initialization commands.
2. Asks one question: `What are you working on?`
3. Uses the same vague-goal warning as `Witness: Start Tracking This Task`.
4. Creates a Witness tracking session.
5. Opens an unsaved markdown editor tab containing the copy-ready coding-agent prompt.
6. Shows a `Copy Prompt` action and tells the user to paste the prompt into their coding agent.

Does not open the onboarding page.
Does not call an LLM.
Does not inject the prompt into any coding agent automatically.
Does not overwrite existing `.witness/` files.

Emits telemetry event `witness.start_with_witness.started` with attributes:
`initialized_project`, `active_session_created`, `goal_length`,
`used_generic_goal_warning`, `prompt_opened`, `copied_to_clipboard`,
`completed`, and `cancelled_at`.

---

### Witness: Start New Task

**Command ID**: `witness.startNewTask`

Safe restart flow for switching from the current work block to a new task. Use this instead of
deleting `.witness/sessions/` files manually.

If Witness is not enabled, the command tells you to run `Witness: Start with Witness` first. It
does not initialize the project automatically.

If an active session exists, asks:
`Start a new task and keep the current session archived?`

Options:
- `Start New Task` — preserve the current session and continue to the new task flow
- `Open Current Session` — open `.witness/sessions/<active-session-id>.md` without creating a new session
- `Cancel` — keep tracking the current task

When starting a new task, the command asks `What are you working on?`, uses the same vague-goal
warning as `Witness: Start Tracking This Task`, optionally asks whether to run `Create Checkpoint`
first, then creates a new tracking session and opens the copy-ready coding-agent prompt.

Does not delete old session files.
Does not delete `.witness/` files.
Does not generate a handover automatically.
Does not inject the prompt into any coding agent automatically.

Emits telemetry event `witness.task_tracking.restarted` with attributes:
`had_active_session`, `opened_current_session`, `checkpoint_requested`,
`checkpoint_command_invoked`, `active_session_created`, `goal_length`,
`used_generic_goal_warning`, `prompt_opened`, `copied_to_clipboard`,
`completed`, and `cancelled_at`.

---

### Witness: Enable for This Project

**Command ID**: `witness.enableProject`

Beginner-friendly wrapper around project initialization. Creates the `.witness/` directory
structure in the current workspace root, including all template and harness files. Uses
plain-language messages and shows a next-step prompt on success.

If `.witness/` already exists, exits gracefully with a friendly message without overwriting
anything. If no workspace folder is open, shows an error.

After successful enable, shows:
`Witness is enabled. Next: run "Witness: Start Tracking This Task".`

Delegates all directory and file creation to the same core used by `witness.initProject`.
Emits telemetry event `witness.project.enabled`.

---

### Witness: Start Tracking This Task

**Command ID**: `witness.startTrackingTask`

Beginner-friendly entry point for starting a Witness session. Asks only one question:
`What are you working on?`

Validates the task goal:
- If empty or cancelled, exits without writing anything.
- If fewer than 10 characters or a generic term (e.g. `work`, `continue`, `fix stuff`),
  shows a warning: `A bit more detail helps Witness track your work.`
  Offers: `Continue Anyway`, `Edit Goal`, or `Cancel`.

After a valid goal is entered:
1. Creates a Witness session record in `.witness/sessions/` using `session-template.md`.
2. Opens an unsaved markdown editor tab containing a copy-ready coding-agent prompt with
   the task goal substituted.
3. Shows a notification with a `Copy Prompt` action for one-click clipboard copy.

Does not open the session file in the editor.
Does not update `current-state.md` automatically (v5.1a scope).
Does not inject context into any coding agent.

Requires `.witness/` to exist (run `Witness: Enable for This Project` first).
Emits telemetry event `witness.task_tracking.started` with attributes: `goal_length`,
`used_generic_goal_warning`, `prompt_opened`, `copied_to_clipboard`.

---

### Witness: Create Checkpoint

**Command ID**: `witness.createCheckpoint`

Beginner-friendly checkpoint wrapper. Saves enough project memory so a later AI coding session
can understand what changed.

Steps:
1. Checks that Witness is enabled in this project.
2. If no active task session is found, warns and offers Cancel or Continue.
3. Runs `Witness: Observe Workspace` to capture the current git state.
4. Asks: Open Current State for Update, or Skip Current State Update.
5. If update is chosen, runs `Witness: Compress Current State` (archives current-state.md and
   opens it for manual trimming).
6. Shows: `Witness: Checkpoint created.`

Does not automatically run Assess Continuity Risk, Generate Handover, or Create Context Packet.
If inner commands fail (e.g. no active session), the checkpoint workflow continues and the inner
command's own error messages are shown.

Emits telemetry event `witness.checkpoint.created` with attributes: `ran_observe_workspace`,
`ran_compress_state`, `completed`, `cancelled_at`.

---

### Witness: Resume with Witness

**Command ID**: `witness.resumeWithWitness`

Beginner-friendly resume helper. Generates a copy-ready coding-agent prompt pre-loaded with the
standard Witness read set. The user pastes the prompt into any AI coding agent (Claude, Copilot,
Codex, Cursor, etc.) to begin a new session with full Witness context.

Does not require an active session.

Default read set used in the prompt:
- `.witness/index.md`
- `.witness/current-state.md`
- `.witness/handovers/latest.md`

If a reviewed context packet is found in `.witness/sessions/`, its workspace-relative path is
appended to the prompt body so the coding agent can locate it without manual input. The
notification also calls it out explicitly: `Optional reviewed context packet detected: <path>`.
The default read set is always included regardless.

Steps:
1. Checks that Witness is enabled in this project.
2. Scans for the latest context packet (informational; best-effort).
3. Opens an unsaved markdown editor tab with the copy-ready resume prompt.
4. Shows a notification with a `Copy Prompt` action for one-click clipboard copy.

Does not inject the prompt into any coding agent automatically.
Does not read raw telemetry content.
Does not scan all `.witness/` files.

Emits telemetry event `witness.resume_prompt.generated` with attributes:
`context_packet_detected`, `prompt_opened`, `copied_to_clipboard`, `completed`, `cancelled_at`.

---

## Group 1: Project and Session Foundation

### Witness: Initialize Project

**Command ID**: `witness.initProject`

Creates the `.witness/` directory structure in the current workspace root. Populates the four
top-level documents (`constitution.md`, `index.md`, `current-state.md`, `commands.md`) and copies
all 12 template files into `.witness/templates/`. Creates empty subdirectories with `.gitkeep`
files for `sessions/`, `telemetry/`, `subagents/`, `decisions/`, `handovers/`, and `evaluation/`.

Safe to run on any workspace. Idempotent — does not overwrite files that already exist.

---

### Witness: Start Session

**Command ID**: `witness.startSession`

Opens a new session record in `sessions/` using `session-template.md`. Prompts for a session goal
and records the start timestamp. Creates the corresponding telemetry directory and sets the active
session pointer in `.witness/.current-session`. Opens the new session file in the editor.

---

## Group 2: Context and Workspace State

### Witness: Record Context Snapshot

**Command ID**: `witness.recordContext`

Creates a context pressure snapshot in `.witness/telemetry/<session-id>/context-pressure-NNN.md`
using `context-pressure-template.md`. Prompts for the measurement method (direct, CLI output,
proxy estimate) and an estimated pressure percentage. Computes the pressure level automatically
from the locked thresholds. Opens the snapshot file in the editor for manual completion.

Context pressure is estimated by the developer. Witness supports minimal reliable context loading
but does not automatically measure token usage.

Requires an active session.

---

### Witness: Observe Workspace

**Command ID**: `witness.observeWorkspace`

Captures a point-in-time observation of the workspace without interactive prompts. Uses the
`vscode.git` extension API to collect the current branch, HEAD commit, working-tree and index
change counts, up to 10 dirty file paths, and the last 5 commits. Writes the observation to
`.witness/sessions/<session-id>-observation-NNN.md` and opens it in the editor.

If git is unavailable, the file is still written with a clear notice rather than failing.

Requires an active session.

---

### Witness: Assess Continuity Risk

**Command ID**: `witness.assessRisk`

Guides the user through five sequential QuickPick prompts — one per locked risk dimension (Active
Context Pressure, Artifact Externalization Gap, Subagent Boundary Risk, Quality Drift, Phase
Boundary Risk) — each offering the five risk levels (GREEN / YELLOW / ORANGE / RED / BLOCKED).
After all five picks, auto-computes the suggested overall level via the worst-wins rule, then
presents a sixth QuickPick pre-selecting the suggestion so the user can confirm or override.

Writes `<session-id>-risk-NNN.md` to `.witness/sessions/` and opens it in the editor. High risk
does not mean switch immediately — it means generate a validated handover before the next session
boundary.

Requires an active session.

---

### Witness: Compress Current State

**Command ID**: `witness.compressState`

Snapshots the current contents of `.witness/current-state.md` into a dated archive file at
`.witness/sessions/<session-id>-current-state-NNN.md`, then opens the live `current-state.md`
in the editor for manual trimming. Displays pre-compression statistics (line count, character
count, heading count) in the success message. Provides an "Open Snapshot" action button for
side-by-side comparison.

No automated compression is performed — the developer decides what to trim.

Requires an active session.

---

## Group 3: Decisions and Handover

### Witness: Create ADR

**Command ID**: `witness.createADR`

Prompts for a decision-focused title, then computes the next project-wide sequential ADR number
by scanning `.witness/decisions/`. Writes the new ADR to `.witness/decisions/ADR-NNNN-<slug>.md`
using `adr-template.md`. Records the active session ID in the document header. Opens the file in
the editor.

An active session is not required.

---

### Witness: Generate Handover

**Command ID**: `witness.generateHandover`

Gathers artifact references for the active session — latest risk assessment, observation,
context-pressure snapshot, ADRs referencing this session, and subagent entries referencing this
session — then renders a handover document from `handover-template.md`. Every placeholder is
addressed: data-backed fields are substituted; missing source artifacts produce explicit gap
markers rather than failing the command.

Writes to `.witness/handovers/handover-<session-id>-NNN.md` and simultaneously overwrites
`.witness/handovers/latest.md` with the same content. Opens the dated file in the editor.

Requires an active session.

---

### Witness: Validate Handover

**Command ID**: `witness.validateHandover`

Validates the most recent handover document (preferring `handovers/latest.md`). Runs rule classes
against the handover: unfilled placeholders, risk dimension label presence, risk level vocabulary,
broken links, missing required sections, and mandatory-field gap markers. A handover PASSES iff
there are zero ERRORs.

Writes a detailed report to `.witness/evaluation/handover-<id>-validation-NNN.md` and opens it
in the editor. Does not modify the handover file.

---

### Witness: Create Resume Probe

**Command ID**: `witness.createResumeProbe`

Creates a resume probe document in `.witness/evaluation/` using `resume-probe-template.md`.
Extracts the handover ID from the handover content and computes the next per-handover probe
ordinal. The probe filename is `resume-probe-<handover-id>-NNN.md`. Opens the file in the editor.

---

### Witness: Create Context Packet

**Command ID**: `witness.createContextPacket`

Assembles a reviewed context packet for starting or resuming a fresh primary coding-agent session.

Requires an active session, `.witness/current-state.md`, and `.witness/handovers/latest.md`.
If either required file is missing, the command fails with a clear error — no partial packet is
written.

Writes to `.witness/sessions/<session-id>-context-packet-NNN.md`. The packet inlines
`current-state.md` and `handovers/latest.md`, and includes reference paths (not inlined content)
for the latest risk assessment, latest observation, ADRs referenced in the handover, and subagent
entries linked to the session.

Counts mandatory markers (`{{`, `TODO`, `MANDATORY`, `[MISSING`, `<fill`) across the inlined
sources and shows a warning if any remain. The developer must review the packet before using it
with an agent session.

Context packets are developer-reviewed artifacts. They are not automatically injected into agent
sessions.

---

## Group 4: Subagent Tracking (v1 model)

### Witness: Record Subagent Report

**Command ID**: `witness.recordSubagent`

Prompts for a subagent identifier (free text), the model used (QuickPick), and a one-line summary
of the task given. Writes the report to `.witness/subagents/subagent-NNN.md` using
`subagent-report-template.md`. Opens the file in the editor.

An active session is not required. This is the v1 flat-file model, preserved for lightweight
recording and backward compatibility. For full lifecycle tracing, use the v2 Subagent Ledger
commands in Group 5.

---

## Group 5: Subagent Ledger Lifecycle (v2 model)

The v2 Subagent Ledger tracks the full lifecycle of a delegated subagent task across five stages.
Each entry is a directory under `.witness/subagents/subagent-NNN/`. The ordinal counter spans
both v1 flat files and v2 ledger directories so numbers are never reused.

Run the stages in order. Do not integrate subagent work into the main session without a completed
review.

---

### Witness: Start Subagent Task

**Command ID**: `witness.startSubagentTask`

Creates a contract for a new subagent ledger entry. Prompts for the task goal and acceptance
criteria. Writes `.witness/subagents/subagent-NNN/contract.md` and opens it in the editor.

Review and complete the remaining contract fields (scope constraints, allowed context, expected
evidence) before dispatching the subagent.

---

### Witness: Create Subagent Context Packet

**Command ID**: `witness.createSubagentContextPacket`

Creates the context packet stage for an existing ledger entry that has a contract but no
context packet. Presents a QuickPick of qualifying tasks. Prompts for source files, witness
artifacts, excluded context, and an optional estimated token count.

Writes `.witness/subagents/subagent-NNN/context-packet.md` with create-or-overwrite semantics
(context assembly is iterative). Opens the file in the editor.

---

### Witness: Record Subagent Evidence

**Command ID**: `witness.recordSubagentEvidence`

Creates the evidence stage for an existing ledger entry that has a contract but no evidence file.
Presents a QuickPick of qualifying tasks (tasks with a context packet are listed with a visible
indicator). No additional user prompts — the file is opened immediately for manual fill-in.

Writes `.witness/subagents/subagent-NNN/evidence.md` and opens it in the editor. Fill in the
files inspected, files modified, actions taken, decisions made, and deviations from contract while
they are fresh.

---

### Witness: Complete Subagent Task

**Command ID**: `witness.completeSubagentTask`

Creates the completion report stage for an existing ledger entry that has a contract but no
report. Presents a QuickPick of qualifying tasks, then a second QuickPick for completion status
(complete, complete-with-warnings, blocked, failed).

Writes `.witness/subagents/subagent-NNN/report.md` and opens it in the editor. Fill in the
acceptance criteria status table, gaps, and follow-up.

---

### Witness: Review Subagent Task

**Command ID**: `witness.reviewSubagentTask`

Creates the review stage for an existing ledger entry that has a report but no review. Presents
a QuickPick of qualifying tasks, then a second QuickPick for the review decision (accepted,
accepted-with-conditions, rejected).

Writes `.witness/subagents/subagent-NNN/review.md` and opens it in the editor. Fill in the
integration actions taken, conditions or remediation required, and whether results were promoted
to `current-state.md` or an ADR.

Telemetry for this command includes `ledger_complete: true` when all five stage files are present
after the review is written.

---

## Group 6: Guided Workflows (v3.5)

These commands guide the developer through multi-step Witness workflows with explicit confirmation
at each step. They orchestrate existing Witness commands via the VS Code command system. They do
not bypass inner command prompts, do not automatically switch sessions, and do not write artifact
content themselves.

---

### Witness: Checkpoint Now

**Command ID**: `witness.checkpointNow`

Guides the developer through a quick continuity checkpoint in three steps: observe the workspace,
assess continuity risk, and choose a follow-up action.

Steps:
1. Confirmation prompt — the developer must confirm before any commands run.
2. Runs `Witness: Observe Workspace` to capture the current git and workspace state.
3. Runs `Witness: Assess Continuity Risk` to record risk levels across all five dimensions.
4. Presents a QuickPick offering: Compress Current State, Generate Handover, Show Workspace
   Status, or Do Nothing.

The follow-up action is always developer-chosen. No automatic selection based on risk level.

Emits telemetry event `witness.workflow.checkpoint_completed` with step count, selected action,
and completion status.

---

### Witness: Prepare Session Switch

**Command ID**: `witness.prepareSessionSwitch`

Guides the developer through the full artifact preparation sequence before switching sessions.
Requires an active session.

Steps:
1. Checks for an active session. Exits with an error if none is found.
2. Confirmation prompt.
3. Runs `Witness: Generate Handover`.
4. Runs `Witness: Validate Handover`.
5. Runs `Witness: Create Resume Probe`.
6. Runs `Witness: Create Context Packet`.

Does not switch sessions. Does not modify the active session pointer. Each inner command retains
its own prompts and can be cancelled individually. If any step throws an unhandled error, the
workflow stops and reports which step failed.

Emits telemetry event `witness.workflow.session_switch_prepared` with step count, command
sequence (IDs only), and completion status.

---

### Witness: Resume Session

**Command ID**: `witness.resumeSession`

Guides the developer through selecting a context packet and choosing a resumption action.

Steps:
1. Scans `.witness/sessions/` for files matching `*-context-packet-*.md`. Sorted by modification
   time, most recent first. Exits with an information message if none are found.
2. Presents a QuickPick of available context packets.
3. Opens the selected context packet in the editor for review.
4. Presents a QuickPick offering: Create Resume Probe, Start New Session, Show Workspace Status,
   or Done.

Does not inject context into any coding agent automatically. Sessions are only switched if the
developer explicitly selects `Start New Session` in step 4.

Emits telemetry event `witness.workflow.session_resumed` with selected action and completion
status.

---

## Group 7: Evaluation and Reporting (v3.6)

---

### Witness: Generate Evaluation Summary

**Command ID**: `witness.generateEvaluationSummary`

Generates a deterministic, markdown-based evaluation summary for the active session by scanning
`.witness/` artifacts and local telemetry. No LLM calls. No network calls.

Requires an active session.

The summary covers nine sections:

1. **Command Activity** — telemetry event count and distinct command IDs recorded for this session.
2. **Context Snapshots** — count of `context-pressure-NNN.md` files and pressure levels extracted.
3. **Handovers** — count of session handover documents and whether `latest.md` exists.
4. **Validation Results** — count of validation reports linked to this session.
5. **Context Packets** — count of context packets written for this session.
6. **Subagent Ledger Health** — total, healthy, needs-review, incomplete, blocked, and loop-risk
   counts from the subagent ledger; completion rate as `healthy/total (pct%)`.
7. **Risk Assessments** — count of risk files for this session and the latest overall risk level.
8. **Observable Context Degradation Signals** — current-state and handover ages, context packet
   presence, pending reviews, blocked subagents, and latest suggested action.
9. **Research Notes** — disclaimer that the summary is artifact-only evidence and does not inspect
   AI chat transcripts or model chain-of-thought.

Writes to `.witness/evaluation/evaluation-summary-<session-id>-NNN.md` and opens the file in the
editor.

Emits telemetry event `witness.evaluation_summary.generated` with 15 structured attributes
including all subagent health counts, risk level, and session artifact counts.

---

## Group 8: Continuity Issue Resolution (v4.2)

---

### Witness: Resolve Continuity Issue

**Command ID**: `witness.resolveContinuityIssue`

Translates the top-priority continuity issue from the current workspace status into developer-
friendly language and guides the developer through resolving it in one interaction.

For every issue, the command answers four questions:

1. **What happened?** — A single sentence describing the observable state Witness found.
2. **Why does it matter?** — A single sentence explaining the continuity risk in terms of
   developer impact, not internal model terminology.
3. **What should I do next?** — A concrete, actionable instruction naming the specific artifact
   or command the developer should use.
4. **What evidence did Witness use?** — The specific artifact ages, field values, and counts that
   Witness measured to reach this conclusion.

Steps:

1. Computes a fresh `WitnessWorkspaceStatus` from the current `.witness/` artifact set.
2. Builds a `ContinuityResolutionPlan` via `resolveTopIssue`. Classification uses the suggested
   action ID only — the v3 suggested action command ID is not passed through (Q7 lock).
3. If no issue is found (all-clear), shows an information message and exits.
4. Presents the four-question summary in a pre-action information message with three choices:
   `Continue`, `Show Workspace Status`, or `Cancel`.
5. Opens relevant `.witness/` artifact files in the editor (read-only) if the plan specifies
   artifact paths.
6. Shows a QuickPick of resolution actions: the primary action first, then secondary actions.
   The developer selects one action before anything is executed.
7. If the selected action has a command ID, executes that existing Witness command. The inner
   command's own prompts and confirmation gates remain in effect.
8. If the selected action has no command ID (e.g. "Do nothing — mark as seen"), shows a short
   confirmation message and exits without writing anything.

Does not write to `.witness/` directly. All artifact writes happen only inside the inner command
the developer explicitly selects. Does not automatically generate handovers, review subagent work,
switch sessions, or inject context into any coding agent.

No LLM calls. No raw transcript capture. No hidden reasoning capture.

Emits telemetry event `witness.continuity_issue.resolved` with attributes: `issue_kind`,
`severity`, `selected_action_label`, `selected_action_command_id`, `was_primary`,
`artifact_paths_opened`, `evidence_count`, `completed`, and `cancelled_at`.

---

## Group 9: Agent-Assisted Artifact Maintenance (v6)

These commands support the v6 agent-assisted maintenance workflow. The developer does not
manually write `.witness/` artifacts during normal coding. Witness detects maintenance needs,
generates safe prompts for the active coding agent, and validates the results before asking
for developer approval.

Core principle: LLM may draft. Witness validates. Developer approves.

---

### Witness: Update Project Memory with Agent

**Command ID:** `witness.updateProjectMemoryWithAgent`

Generates a strict artifact-maintenance prompt for your active coding agent. The prompt
restricts the agent to `.witness/` artifact work and requires human review.

**Behavior:**

1. Computes the current workspace status.
2. Determines the most relevant Witness maintenance need (stale current-state, missing
   checkpoint, recommended handover, pending subagent review, or resume orientation).
3. If project memory is fully up to date, shows a confirmation and exits.
4. If Witness is not enabled, shows an error directing the developer to enable it first.
5. Generates a complete artifact-maintenance prompt specifying:
   - The role and task for the coding agent.
   - Which `.witness/` files to read.
   - Which files the agent is allowed to write (artifact-only).
   - Which files are explicitly forbidden (all source code).
   - Which sections the output artifact must contain.
   - The human review requirement before any file is written.
6. Opens the prompt in an unsaved markdown tab.
7. Shows a notification with a one-click `Copy Prompt` action.

**What this command does not do:**

- Does not call any LLM.
- Does not write to `.witness/` or any source file.
- Does not inject content into any coding agent.
- Does not validate the resulting artifact (use `Witness: Validate Artifact Maintenance`
  after the coding agent has completed the task).

**After using this command:**

1. Copy the prompt from the tab or notification.
2. Paste it into your active coding agent (Claude, Copilot, Codex, Cursor, or equivalent).
3. The agent will draft the `.witness/` artifact and present it for your review.
4. Review the draft and approve or request revisions.
5. Run `Witness: Validate Artifact Maintenance` to confirm the artifact is well-formed.

No LLM calls. No automatic context injection. No source-code modification.

Emits telemetry event `witness.artifact_maintenance.prompt_generated` with attributes:
`maintenance_kind`, `severity`, `evidence_count`, `active_session_present`,
`prompt_opened`, `copied_to_clipboard`, `completed`, `cancelled_at`.

---

### Witness: Validate Artifact Maintenance

**Command ID:** `witness.validateArtifactMaintenance`

Validates that a recent agent-assisted artifact-maintenance task stayed inside the `.witness/`
boundary and produced the required artifact structure.

**Behavior:**

1. Detects changed files from git (working tree dirty files) if available, or prompts the
   developer to enter file paths manually (one per line or comma-separated).
2. Asks the developer which kind of maintenance was performed, via a QuickPick:
   - Update current-state
   - Create checkpoint
   - Prepare handover
   - Review subagent artifacts
   - Resume with Witness
   - Skip section validation (boundary check only)
3. Reads the contents of changed `.witness/` markdown files only. Skips source files,
   telemetry files, and non-markdown files.
4. Runs the deterministic artifact maintenance validator, which checks:
   - File boundary: any file outside `.witness/` triggers a critical failure.
   - Empty change list: warns that no changed files were detected.
   - Required sections: checks that the generated artifact contains all required
     markdown section headings for the selected maintenance kind.
   - Mandatory markers: warns if any artifact contains unresolved placeholders
     (`TODO`, `TBD`, `{{`, `}}`, `[FILL`, `<...>`).
5. Opens an unsaved markdown validation report containing: status, summary, changed
   Witness files, changed non-Witness files, issues (with severity and evidence),
   and a next-step recommendation.
6. Shows a status notification (passed / warning / failed).

**Validation statuses:**

- `passed` — only `.witness/` files changed, required sections are present, no markers.
- `warning` — no files detected, missing sections, or unresolved placeholders. Review recommended.
- `failed` — non-`.witness/` files were modified. Do not trust the artifact update.

**What this command does not do:**

- Does not call any LLM.
- Does not write to `.witness/` or any source file.
- Does not automatically approve or reject agent-generated artifacts.
- Does not read source files or telemetry files.

No LLM calls. No automatic approval. No source-code modification.

Emits telemetry event `witness.artifact_maintenance.validated` with attributes:
`status`, `issue_count`, `changed_witness_file_count`, `changed_non_witness_file_count`,
`expected_kind`, `completed`, `cancelled_at`.
