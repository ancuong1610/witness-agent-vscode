# Witness Agent — Developer Workflow Guide (v4)

This document describes the realistic end-to-end workflow for a developer using Witness Agent v4
alongside a coding agent such as GitHub Copilot or Claude Code.

The workflow is not rigid. Steps within a session repeat freely. The critical discipline is
generating a validated handover before ending any session where meaningful work was done.

**Core UX principle**: Witness should reduce continuity workload, not create new workflow workload.
The v3/v4 background layer is designed to surface guidance only when relevant — not to add a new
dashboard the developer must constantly monitor.

**What Witness does automatically** (no developer action required):
activate when a `.witness/index.md` workspace is opened, observe `.witness/` file ages, classify
workspace continuity state, warn via the status bar, and suggest the next safe action.

**What Witness requires developer confirmation for**:
write any artifact, review subagent work, compress current state, generate a handover,
prepare a session switch, or start a new session.

---

## Phase 0: One-Time Setup

### Initialize Project

Run `Witness: Initialize Project` once per workspace. This creates the `.witness/` directory
structure, populates the four top-level documents (`constitution.md`, `index.md`,
`current-state.md`, `commands.md`), copies all 12 templates into `.witness/templates/`, writes
`.witness/AGENTS.md`, copies the four Agent Harness Pack protocol files into `.witness/harness/`,
and seeds empty subdirectories with `.gitkeep` files.

Fill in `.witness/current-state.md` with the current project state immediately after
initialization. This is the single source of truth the fresh-session read set depends on.

If the project has relevant architectural decisions, record them with `Witness: Create ADR`. The
ADR archive is reference material — not a fresh-session load requirement — but its quality directly
affects handover and context packet quality.

---

## Phase 1: Session Start

### Start Session

At the beginning of each coding agent session, run `Witness: Start Session`. Provide a brief
session goal. Witness records the session to `.witness/sessions/<session-id>.md` and sets the
active session pointer.

Load the fresh-session read set into the coding agent's context:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

If a reviewed context packet exists from a previous session
(`.witness/sessions/<session-id>-context-packet-NNN.md`), load that instead of or alongside the
individual files. Context packets are developer-reviewed artifacts. Do not use an unreviewed packet.

Do not front-load telemetry, session histories, the full ADR archive, or all subagent evidence.
Pull those on demand only when the task specifically requires them.

---

## Phase 2: Working with the Coding Agent

This phase repeats throughout the session.

### Observe Workspace (as needed)

Run `Witness: Observe Workspace` to snapshot the current git state. No prompts required. Run this
before generating a handover, before delegating to a subagent, or whenever you want a
point-in-time workspace snapshot.

### Record Context Snapshot (when pressure is notable)

Run `Witness: Record Context Snapshot` to capture a context pressure measurement. Choose the
measurement method and provide an estimated percentage. This feeds the Active Context Pressure
dimension of the risk assessment.

### Assess Continuity Risk (regularly, and before handover)

Run `Witness: Assess Continuity Risk` to evaluate the five risk dimensions. Witness computes the
overall level using the worst-wins rule and presents it for confirmation or override. Run this:
- When context pressure is high
- Before delegating significant work to a subagent
- Before generating a handover
- At natural phase boundaries

### Create ADR (when a decision is made)

Run `Witness: Create ADR` immediately when a meaningful architectural or design decision is made.
Do not defer ADR creation — decisions are easiest to capture while the context is fresh.

---

## Phase 3: Delegating to a Subagent

Use the v2 Subagent Ledger when delegating a bounded task to a subordinate coding agent.

### Step 1 — Start Subagent Task

Run `Witness: Start Subagent Task`. Provide the task goal and acceptance criteria. Witness creates
`.witness/subagents/subagent-NNN/contract.md`. Complete the remaining fields before dispatch.

### Step 2 — Create Subagent Context Packet

Run `Witness: Create Subagent Context Packet`. Select the task. Provide the source files, witness
artifacts, and excluded context. Witness creates
`.witness/subagents/subagent-NNN/context-packet.md`. Review the packet before handing it to the
subagent.

### Step 3 — Dispatch the Subagent

Give the subagent the contract and context packet. Do not give it the full `.witness/` directory.

### Step 4 — Record Subagent Evidence

After the subagent completes, run `Witness: Record Subagent Evidence`. Witness creates
`.witness/subagents/subagent-NNN/evidence.md`. Fill in the files inspected, files modified, actions
taken, and deviations from contract while they are fresh.

### Step 5 — Complete Subagent Task

Run `Witness: Complete Subagent Task`. Choose the completion status (complete,
complete-with-warnings, blocked, failed). Witness creates
`.witness/subagents/subagent-NNN/report.md`. Fill in the acceptance criteria status and gaps.

### Step 6 — Review Subagent Task

Run `Witness: Review Subagent Task`. Choose the review decision (accepted,
accepted-with-conditions, rejected). Witness creates `.witness/subagents/subagent-NNN/review.md`.
Fill in the integration actions and whether results were promoted to `current-state.md` or an ADR.

Do not integrate subagent work into the main session without a completed review.

---

## Phase 4: Ending the Session

### Generate Handover

Run `Witness: Generate Handover` before ending any session where meaningful work was done. Witness
gathers all available artifacts and renders a complete handover document. Missing artifacts produce
explicit gap markers rather than errors. The command writes both
`.witness/handovers/handover-<session-id>-NNN.md` and `.witness/handovers/latest.md`.

### Validate Handover

Run `Witness: Validate Handover` immediately after generating the handover. A handover PASSES only
when it has zero ERRORs. If it fails, edit it and re-validate until it passes.

Do not hand an unvalidated handover to a fresh session.

### Compress Current State (when current-state.md is long)

Run `Witness: Compress Current State` to archive `current-state.md` and open it for manual
trimming. Remove sections no longer relevant to the next session. The archive is preserved in
`.witness/sessions/<session-id>-current-state-NNN.md`.

### Create Resume Probe (for high-stakes handoffs)

Run `Witness: Create Resume Probe` to generate a quiz for validating handover quality from a fresh
agent's perspective. Fill in expected answers and pass/fail criteria, then test the handover
against a fresh session before relying on it.

---

## Phase 5: Creating a Context Packet for Session Resume

Run `Witness: Create Context Packet` to assemble a reviewed context packet for the next session.

Requires an active session, `.witness/current-state.md`, and `.witness/handovers/latest.md`.

The command produces `.witness/sessions/<session-id>-context-packet-NNN.md`. It inlines the
current state and latest handover, and includes reference paths (not inlined content) for the
latest risk assessment, workspace observation, referenced ADRs, and linked subagent entries.

Review the packet before using it. Check the embedded validation checklist. If the mandatory
marker count is greater than zero, Witness will warn you. Resolve the markers before using the
packet.

To start the next session, load the reviewed packet into the coding agent's context. The agent
should read the packet, acknowledge its contents, and proceed only with what the packet specifies.
It should not scan all `.witness/` files by default.

---

## Phase 6: Background Continuity (v3/v4)

Once `.witness/` exists and a session is active, the background layer operates automatically.
In v4, the extension also activates automatically when VS Code opens any workspace containing
`.witness/index.md` — no command palette invocation required to see the status bar.

### Agent Harness Pack (v4.6)

After initialization, the workspace contains `.witness/AGENTS.md` and `.witness/harness/`. These
files are agent-readable instructions for coding agents consuming this workspace.

If you are directing a coding agent to work on this project, you can load `.witness/AGENTS.md`
into the agent's context as an entry point. It explains the default read set, the constraints,
and links to the five protocol files in `.witness/harness/`.

For orchestrator-style workflows — any coding-agent workflow that delegates bounded tasks to
subagents — also reference `.witness/harness/orchestrator.md`. It defines when to use No Ledger,
Lightweight Ledger, or Full Ledger, and provides delegation, failure, and context minimization
policies. It applies to Codex, Superpowers, Claude Code, Copilot, and any future orchestration
pattern that can read project files and follow markdown instructions.

Coding agents can use these files when the developer loads or references them. The harness files
do not integrate with any coding agent API and are not automatically injected into any context.

### Resolver-First Interaction Pattern (v4)

The normal v4 developer interaction is:

1. **Code normally.** The Witness status bar watches quietly in the background.
2. **Status changes.** If a continuity issue arises, the status bar label changes (e.g.
   `Witness: Review Needed`) and the color shifts.
3. **Click the status bar.** A QuickPick opens. When an issue is active, the first item is
   `Resolve: <issue label>` — the `Witness: Resolve Continuity Issue` command.
4. **Select Resolve.** A markdown preview tab opens explaining the issue in four sections:
   what happened, why it matters, what to do next, and evidence paths.
5. **Read the explanation.** No write has occurred yet. The QuickPick follows automatically.
6. **Choose an action.** The QuickPick presents a ranked list of available commands for this
   issue type. Select one to execute it, or press Escape to cancel.
7. **Witness executes the selected command.** No write or session switch happens until the
   developer makes a selection. If the developer cancels, nothing changes.

This pattern replaces the prior workflow of: notice status bar → open command palette → search
for the right command → run it.

### Witness: Resolve Continuity Issue (v4)

`Witness: Resolve Continuity Issue` is the v4 guided resolver. It answers four questions about
the current top continuity issue: what happened, why it matters, what to do next, and what
evidence is available. It then presents a QuickPick of available actions for the issue type.

The command does not write anything, open any file for editing, or switch sessions by itself.
Every write is triggered only by the command the developer selects from the QuickPick.

The command is surfaced automatically as the first QuickPick item when the status bar is clicked
and the workspace state is not all-clear. It can also be run directly from the command palette.

### Status Bar

The status bar item (bottom bar, prefixed `Witness:`) shows the current continuity state at a
glance. It activates automatically when a workspace containing `.witness/index.md` is opened.
It refreshes automatically on `.witness/` file saves and on workspace changes. No action
is required — it is informational by default.

Clicking the status bar item opens a QuickPick. When the workspace state is not all-clear, the
first item is `Resolve: <issue label>` (the resolver command with the issue's description).
The suggested action command follows. Selecting any item executes the corresponding command.

Status labels and what they mean:

| Label | What it means |
|-------|---------------|
| `Witness: OK` | All continuity checks pass. Continue working. |
| `Witness: No Session` | No active session. Run `Witness: Start Session`. |
| `Witness: Review Needed` | A subagent task is pending review. |
| `Witness: Risk Critical` | Risk level is RED or BLOCKED. Generate a handover. |
| `Witness: Subagent Blocked` | A subagent task is blocked or failed. |
| `Witness: Stale Artifacts` | Handover or current state is stale. Consider a checkpoint. |
| `Witness: Setup Needed` | No `.witness/` project. Run `Witness: Initialize Project`. |

### Guided Workflows (v3.5)

These commands guide the developer through multi-step workflows with an explicit confirmation at
the start and developer choice at each decision point.

**Checkpoint Now** (`Witness: Checkpoint Now`):
Run when the status bar shows a warning and you have a few minutes. The command runs Observe
Workspace, then Assess Continuity Risk, then offers a QuickPick of follow-up actions. The
developer chooses whether to compress, generate a handover, open status, or do nothing.

**Prepare Session Switch** (`Witness: Prepare Session Switch`):
Run before ending a meaningful session. The command runs Generate Handover, Validate Handover,
Create Resume Probe, and Create Context Packet in sequence. Each step can be cancelled. The
workflow stops and reports if any step throws an unhandled error. Does not switch the active session.

**Resume Session** (`Witness: Resume Session`):
Run when returning to a project after a break. The command lists available context packets sorted
by modification time, opens the selected one for review, then offers a QuickPick of actions:
create a resume probe, start a new session, show workspace status, or done.

### Evaluation Summary (v3.6)

Run `Witness: Generate Evaluation Summary` at the end of a session to produce a deterministic
markdown summary of all session artifacts. The summary covers: command activity (from telemetry),
context snapshots, handovers, validation reports, context packets, subagent ledger health, risk
assessments, and observable degradation signals. It does not inspect AI chat transcripts or
hidden model reasoning. Writes to `.witness/evaluation/evaluation-summary-<session-id>-NNN.md`.

---

## Recurring Principle

Store broadly — record sessions, ADRs, subagent evidence, and observations without over-filtering.

Compress carefully — trim `current-state.md` deliberately using `Witness: Compress Current State`
as the checkpoint, not a freeform delete.

Load minimally — start each fresh session with exactly the three default files, plus a reviewed
context packet if one exists.

Validate resume quality — use `Witness: Validate Handover` and `Witness: Create Resume Probe`
before trusting a handover to carry a session boundary.

Trust the status bar — let the background layer surface the next safe action. When the status
shows an issue, click the bar and select `Resolve` to get a full explanation before choosing an
action. Ignore the bar when things are going well. The bar is not a task queue.

---

## Quick Reference: Commands by Phase

| Phase | Command |
|-------|---------|
| Setup | `Witness: Initialize Project` |
| Session start | `Witness: Start Session` |
| During session | `Witness: Observe Workspace` |
| During session | `Witness: Record Context Snapshot` |
| During session | `Witness: Assess Continuity Risk` |
| During session | `Witness: Create ADR` |
| Subagent: before | `Witness: Start Subagent Task` |
| Subagent: before | `Witness: Create Subagent Context Packet` |
| Subagent: after | `Witness: Record Subagent Evidence` |
| Subagent: after | `Witness: Complete Subagent Task` |
| Subagent: after | `Witness: Review Subagent Task` |
| Session end | `Witness: Generate Handover` |
| Session end | `Witness: Validate Handover` |
| Session end | `Witness: Compress Current State` (when needed) |
| Session end | `Witness: Create Resume Probe` (for high-stakes handoffs) |
| Session end / resume | `Witness: Create Context Packet` |
| Anytime | `Witness: Record Subagent Report` (v1 flat model) |
| Background (automatic) | Status bar — continuity state, suggested action, automatic activation |
| Issue resolution (v4) | `Witness: Resolve Continuity Issue` — guided resolver with markdown preview + QuickPick |
| Agent instructions (v4.6) | `.witness/AGENTS.md` — entry point for coding agents; `.witness/harness/` — protocol files |
| Orchestrator guide (v4.7) | `.witness/harness/orchestrator.md` — ledger levels, delegation checklist, failure policy |
| Guided checkpoint | `Witness: Checkpoint Now` |
| Guided switch prep | `Witness: Prepare Session Switch` |
| Guided resume | `Witness: Resume Session` |
| Session evaluation | `Witness: Generate Evaluation Summary` |
| Workspace overview | `Witness: Show Workspace Status` |
