# Witness Agent

A VS Code extension that creates a repo-local `.witness/` continuity system for AI-assisted coding
workflows.

---

## What It Is

Witness Agent is a VS Code background continuity layer for AI-assisted coding. It monitors the
project's `.witness/` state, detects continuity risks, subagent issues, stale handovers, and
missing resume artifacts, then quietly suggests the next safe action. The developer continues
coding normally and only interacts with Witness when a checkpoint, review, or session transition
is needed.

Each AI coding session is ephemeral. When a session ends, the model loses all working memory of
what was decided, which files were mid-edit, what subagents were used, and why certain constraints
exist. Witness Agent addresses this by externalizing project state, decisions, subagent evidence,
handovers, and validation artifacts into `.witness/` so that a fresh session can resume reliably.

The core operating principle is: store broadly, compress carefully, load minimally, and validate
resume quality. A fresh coding agent session should need only three files to resume safely. Witness
Agent is designed to make those three files trustworthy.

The product principle that governs all design decisions:
**Witness should reduce continuity workload, not create new workflow workload.**

In initialized workspaces (`.witness/index.md` is present), Witness activates automatically when
the workspace opens. The status bar appears and begins reflecting continuity state without
requiring any manual command. When a continuity issue is detected, the developer can click the
status bar and select `Resolve: <issue>` to open the guided resolver — a single interaction that
explains what happened, why it matters, what to do next, and what evidence Witness used, then
presents a concise QuickPick of actions. No write or session switch happens until the developer
explicitly selects one.

## What It Is Not

Witness Agent is not a coding agent. It does not write code, execute tasks, or communicate with
any AI backend at runtime.

Witness Agent is not a replacement for GitHub Copilot, Claude Code, Codex, or any coding agent.
It is a continuity, context-control, and tracing layer that runs beside the tool you are already
using.

Witness Agent does not automatically inject context packets into coding agent sessions. Context
packets are developer-reviewed artifacts. The developer decides when and what to load.

Witness Agent is not a pure token counter. Context pressure measurement is one of five continuity
risk dimensions it tracks, not the primary feature. It supports minimal reliable context loading
but does not guarantee token reduction.

Witness Agent does not directly detect context rot. It tracks observable context degradation
signals and continuity risk across five dimensions. The developer confirms and overrides assessments.

Witness Agent is not an automatic session switcher. Every record is intentional and
human-confirmed. Witness Agent surfaces continuity risk signals; the developer decides when to act.

Telemetry recorded by Witness Agent (`.witness/telemetry/otel/events.jsonl`) is not part of the
default fresh-session read set. It is local, structured, and intended for developer analysis.

**Explicit non-goals (v3-locked):**
- No second dashboard the developer must constantly monitor
- No automatic rewriting of `current-state.md`
- No automatic handover generation without developer confirmation
- No automatic subagent review or integration
- No automatic session switching
- No automatic injection of context into coding-agent sessions
- No capture of raw AI chat transcripts
- No capture of hidden model reasoning

**The automatic/confirmed boundary (v3-locked):**

Witness automatically: observes, classifies, warns, and suggests.

Witness requires developer confirmation before it: writes, reviews, compresses, generates a
handover, prepares a session switch, or starts a new session.

---

## Why `.witness/` Exists

A coding agent loses working context at every session boundary. The `.witness/` directory is the
persistent, structured representation of project state that fills this gap. It is the agent's
external memory: a set of artifacts that can be loaded selectively at the start of a fresh session
to restore the minimum reliable context needed to continue work safely.

The directory is version-controlled alongside the project. It is part of the repository, not a
sidecar or plugin state. This means its history is auditable, its artifacts are shareable, and
its contents survive machine migrations and team handoffs.

---

## The Three Conceptual Layers Inside `.witness/`

### 1. Continuity Source-of-Truth Layer

Purpose: give the coding agent the minimum reliable project context needed to resume work.

This layer contains the artifacts a fresh session should read. It is designed for minimal, reliable
loading — not for exhaustive documentation.

| Path | Role |
|------|------|
| `.witness/index.md` | Directory map and reading order guide |
| `.witness/current-state.md` | Single source of truth for current project state |
| `.witness/constitution.md` | Continuity rules, risk vocabulary, and behavioral contracts |
| `.witness/commands.md` | Command palette cheat sheet |
| `.witness/decisions/` | Architectural Decision Records (ADRs) |
| `.witness/sessions/` | Per-session records and session-scoped artifacts |
| `.witness/handovers/` | Validated handover documents |
| `.witness/evaluation/` | Resume probe results and validation reports |
| `.witness/templates/` | Blank templates for runtime use |
| `.witness/subagents/` | Subagent invocation records and v2 ledger directories |

### 2. Telemetry and Evaluation Layer

Purpose: collect structured local telemetry for tracing command execution, continuity risk signals,
and observable context degradation across sessions.

| Path | Role |
|------|------|
| `.witness/telemetry/` | Context pressure snapshots and session-scoped telemetry |
| `.witness/telemetry/otel/events.jsonl` | Local OTel-style structured event log |

As of v2.2, all Witness Agent commands emit structured JSONL events to
`.witness/telemetry/otel/events.jsonl` on every execution. The event schema is OTel-compatible.
Raw telemetry is not part of the default fresh-session read set and should not be loaded into
agent context by default.

### 3. Workflow Harness Layer

Purpose: provide commands, templates, and workflow guidance for coding agents and developers.

Current representation:
- `.witness/commands.md` — command palette cheat sheet
- `.witness/templates/` — blank templates for sessions, ADRs, handovers, subagent ledger stages,
  context packets, and more
- `.witness/AGENTS.md` — agent entry point: default read set, constraints, and harness index
  (v4.6 Agent Harness Pack)
- `.witness/harness/` — agent-readable protocol files for resume, subagent tasks, continuity
  issues, session switches, and orchestrator workflows (v4.6/v4.7 Agent Harness Pack)

The Agent Harness Pack gives coding agents structured instructions for consuming `.witness/`
artifacts safely. Coding agents can use these files when the developer loads or references them.
The pack does not directly integrate with any coding agent API. It does not give agents
permission to write, review, or approve autonomously.

The v4.7 Orchestrator Harness Guide (`.witness/harness/orchestrator.md`) extends the pack for
orchestrator-style coding workflows — Codex, Superpowers, Claude Code, Copilot, or any workflow
that delegates bounded tasks to subagents. It defines three ledger levels (No Ledger, Lightweight
Ledger, Full Ledger), delegation and failure policies, and context minimization rules. It is not
a Superpowers, Copilot, or Codex API integration.

---

## Default Fresh-Session Read Set

When starting a fresh coding agent session, load exactly these files — no more, no less:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

Optional additions, loaded on demand:
- Relevant ADRs from `.witness/decisions/`
- Relevant subagent ledger entries from `.witness/subagents/`
- Relevant validation reports from `.witness/evaluation/`
- A reviewed context packet from `.witness/sessions/<session-id>-context-packet-NNN.md`
  (use `Witness: Create Context Packet` to generate one)

Do not front-load session histories, raw telemetry, the full ADR archive, or all subagent evidence.
These are reference material to be pulled in as specific questions arise.

Context packets are developer-reviewed artifacts. Run `Witness: Create Context Packet` to assemble
one, review it, then load it manually into a fresh agent session when needed.

---

## The Five Continuity Risk Dimensions

Witness Agent evaluates continuity risk across five independent dimensions. All five names are
locked and must be used exactly as written.

1. **Active Context Pressure** — how full the current session context window is
2. **Artifact Externalization Gap** — how much session state has not yet been persisted to `.witness/`
3. **Subagent Boundary Risk** — whether subagent work is traceable and integrated
4. **Quality Drift** — whether the AI session is showing signs of observable degradation over time
5. **Phase Boundary Risk** — whether the session is approaching a natural handoff point

Risk levels are: GREEN, YELLOW, ORANGE, RED, BLOCKED.

High risk does not mean switch immediately. High risk means: preserve context first by generating
a validated handover, then switch only after the handover exists and is validated.

---

## Current Command Set (v4)

All 23 commands are implemented. The original 17 v1/v2 commands are unchanged and
backward-compatible. The 5 v3 background continuity commands are unchanged.

### Group 1: Project and Session Foundation

| Command | Purpose |
|---------|---------|
| `Witness: Initialize Project` | Create the `.witness/` directory structure in the current workspace |
| `Witness: Start Session` | Open a new session record and set the active session pointer |

### Group 2: Context and Workspace State

| Command | Purpose |
|---------|---------|
| `Witness: Record Context Snapshot` | Capture a context pressure measurement for the active session |
| `Witness: Observe Workspace` | Snapshot git state and workspace artifacts into a session observation file |
| `Witness: Assess Continuity Risk` | Guide a five-dimension continuity risk assessment and write the result |
| `Witness: Compress Current State` | Snapshot and archive `current-state.md` then open it for manual trimming |

### Group 3: Decisions and Handover

| Command | Purpose |
|---------|---------|
| `Witness: Create ADR` | Generate a new Architectural Decision Record in `.witness/decisions/` |
| `Witness: Generate Handover` | Render a complete handover document from all available session artifacts |
| `Witness: Validate Handover` | Run rule classes against the most recent handover |
| `Witness: Create Resume Probe` | Generate a per-handover probe for validating resume quality |
| `Witness: Create Context Packet` | Assemble a reviewed context packet for starting a fresh session |

### Group 4: Subagent Tracking (v1 model)

| Command | Purpose |
|---------|---------|
| `Witness: Record Subagent Report` | Write a v1 flat subagent invocation record to `.witness/subagents/` |

### Group 5: Subagent Ledger Lifecycle (v2 model)

| Command | Purpose |
|---------|---------|
| `Witness: Start Subagent Task` | Create a contract for a new subagent task (ledger entry) |
| `Witness: Create Subagent Context Packet` | Assemble and record the context given to a subagent |
| `Witness: Record Subagent Evidence` | Record what the subagent actually did after execution |
| `Witness: Complete Subagent Task` | Write the completion report for a subagent task |
| `Witness: Review Subagent Task` | Write the orchestrator review and integration record |

### Group 6: Background Continuity Layer (v3)

| Command | Purpose |
|---------|---------|
| `Witness: Show Workspace Status` | Open a markdown status report computed from `.witness/` artifacts |
| `Witness: Checkpoint Now` | Guided three-step checkpoint: observe → assess risk → choose follow-up |
| `Witness: Prepare Session Switch` | Guided four-step sequence to prepare artifacts before switching sessions |
| `Witness: Resume Session` | Browse available context packets and choose a resumption action |
| `Witness: Generate Evaluation Summary` | Generate a deterministic artifact-based evaluation summary for the session |

### Group 7: Evaluation (v3.6)

`Witness: Generate Evaluation Summary` is listed in Group 6 above and also counted here as the
transition command that bridges v3 artifact observation to the v4 resolver surface.

### Group 8: Continuity Issue Resolution (v4)

| Command | Purpose |
|---------|---------|
| `Witness: Resolve Continuity Issue` | Translate the top continuity issue into a readable explanation and guided QuickPick |

The resolver opens an unsaved markdown tab in the editor that answers:
1. What happened?
2. Why does it matter?
3. What should I do next?
4. What evidence did Witness use?

After reading the explanation, the developer selects an action from the QuickPick. Witness does
not write, review, switch sessions, or execute any command until the developer makes an explicit
selection.

The status bar item (not a command palette entry) shows current continuity state. In v4, when the
suggested action is not all-clear, the first QuickPick item is `Resolve: <issue>` which launches
`Witness: Resolve Continuity Issue`. This makes the resolver discoverable from the main v3 UX
surface without requiring the developer to find it in the command palette.

---

## v2 Features

### Local OTel-Style Telemetry

All 17 commands emit structured JSONL events to `.witness/telemetry/otel/events.jsonl` on every
execution. Each event includes a timestamp, command ID, session ID, status (success / cancelled /
error), duration, artifact paths (workspace-relative), and command-specific attributes (counts,
booleans, ordinals). No prompt text, file contents, or chat transcripts are written to telemetry.

### Subagent Ledger

The v2 Subagent Ledger models the full lifecycle of a delegated subagent task across five stages:

1. **Contract** — task goal and acceptance criteria defined before dispatch
2. **Context Packet** — minimum context assembled and reviewed before dispatch
3. **Evidence** — execution record written after the subagent completes
4. **Completion Report** — outcomes evaluated against acceptance criteria
5. **Orchestrator Review** — integration decision and integration record

Each ledger entry lives in `.witness/subagents/subagent-NNN/` (v2 directory-based format). The v1
flat-file format (`.witness/subagents/subagent-NNN.md`) is preserved for backward compatibility.
Ordinal counters span both formats so numbers are never reused.

### Session-Level Context Packet

`Witness: Create Context Packet` assembles a reviewed context packet at
`.witness/sessions/<session-id>-context-packet-NNN.md`. The packet inlines `current-state.md` and
`handovers/latest.md`, and includes references (paths only) to the latest risk assessment,
workspace observation, referenced ADRs, and linked subagent entries. The developer reviews the
packet before using it to start a fresh agent session. Mandatory marker detection warns if
unfilled placeholders remain in the inlined sources.

---

## Status

### v1 — Complete and Smoke-Validated

All 11 original commands are implemented and smoke-validated. See `docs/v0.1-validation-report.md`.

### v1.1 — Documentation and Project Framing Lock

Locked scope, conceptual architecture, evaluation model, and subagent ledger direction documented.
See `docs/witness-agent-scope.md`, `docs/witness-conceptual-architecture.md`,
`docs/otel-evaluation-model.md`, `docs/subagent-ledger-v0.2.md`.

### v2 — Complete

All v2 milestones are implemented and compile cleanly.

- **v2.1**: Local OTel-style telemetry writer (`src/core/telemetryWriter.ts`)
- **v2.2**: All 11 v1 commands instrumented with telemetry
- **v2.3**: Subagent Ledger templates and path helpers (`src/core/subagentLedger.ts`)
- **v2.4**: Full Subagent Ledger lifecycle commands (5 new commands; 16 total)
- **v2.5**: Session-level `Witness: Create Context Packet` (17 commands total)
- **v2.6**: Documentation and regression update

See `docs/v2-implementation-plan.md` for the full v2 specification and implementation notes.
See `docs/v2-validation-report.md` for the v2 validation checklist.

### v3 — Complete

All v3 milestones are implemented and compile cleanly. 22 public commands total.

- **v3.1**: Workspace status scanner (`src/core/workspaceStatus.ts`)
- **v3.2**: Subagent health scanner (`src/core/subagentHealth.ts`)
- **v3.3**: Suggested actions engine — 15-rule priority table (`src/core/suggestedActions.ts`)
- **v3.4**: Status bar assistant (`src/core/statusBar.ts`) — internal command only
- **v3.5**: Guided workflow commands — `checkpointNow`, `prepareSessionSwitch`, `resumeSession`
- **v3.6**: Evaluation summary command — `generateEvaluationSummary`
- **v3 UX lock**: Background continuity principle and automatic/confirmed boundary documented

See `docs/v3-implementation-plan.md` for the full v3 specification and implementation notes.
See `docs/v3-validation-report.md` for the v3 validation checklist.
See `docs/product-ux-principles.md` for the locked UX principle and automatic/confirmed boundary.

### v4.7 — Complete

Generic Orchestrator Harness Guide implemented. 23 public commands (unchanged). 24 activation
events (unchanged).

- **v4.7**: Generic Orchestrator Harness Guide — `.witness/harness/orchestrator.md` added to the
  Agent Harness Pack. Guides orchestrator-style coding workflows on when to use No Ledger,
  Lightweight Ledger, or Full Ledger. Includes delegation checklist, multiple-subagent policy,
  failure policy, context minimization rules, and example prompts. No new public commands. No
  API integration. Not specific to any tool.

See `docs/v4-implementation-plan.md` for the full v4.7 specification.
See `docs/v4-validation-report.md` for the v4.7 validation record.

### v4.6 — Complete

Agent Harness Pack implemented. 23 public commands (unchanged). 24 activation events (unchanged).

- **v4.6**: Agent Harness Pack — `.witness/AGENTS.md` entry point and four harness protocol
  files under `.witness/harness/` copied during `Witness: Initialize Project`. Supports both
  manual developer workflow and agent-assisted workflow. No new public commands. No API
  integration.

See `docs/v4-implementation-plan.md` for the full v4.6 specification.
See `docs/v4-validation-report.md` for the v4.6 validation record.

### v4 — Complete

All v4 milestones are implemented and compile cleanly. 23 public commands. 24 activation events.

- **v4.1**: Continuity resolver core (`src/core/continuityResolver.ts`) — synchronous, no I/O,
  maps suggested action id to a `ContinuityResolutionPlan` with four required fields
- **v4.2**: `Witness: Resolve Continuity Issue` command (`src/commands/resolveContinuityIssue.ts`)
  — opens an unsaved markdown resolver preview, then a concise QuickPick; no write until
  the developer selects an existing command
- **v4.2 UX correction**: Replaced `showInformationMessage` pre-action notification with an
  unsaved markdown editor tab; three-button flow removed; QuickPick presented directly
- **v4.3**: Status bar QuickPick integration — first item is `Resolve: <issue>` when the
  suggested action is not all-clear (`src/core/statusBar.ts`)
- **v4.4**: Subagent-focused resolver artifact navigation — four subagent plan builders
  updated to use `subagentHealthSummary.entries` for per-entry `whatHappened` strings,
  stage-aware primary action routing, and concrete file artifact paths
- **Activation hotfix**: `workspaceContains:.witness/index.md` added to `activationEvents`;
  status bar appears automatically when opening an initialized Witness workspace

See `docs/v4-implementation-plan.md` for the full v4 specification and implementation notes.
See `docs/v4-validation-report.md` for the v4 validation checklist.

---

## Installation (Development)

This extension is not yet published to the VS Code Marketplace. To run it locally:

1. Clone the repository and install dependencies:
   ```
   git clone <repo-url>
   cd witness-agent-vscode
   npm install
   ```

2. Open the folder in VS Code and press `F5` to launch an Extension Development Host window.

3. In the Extension Development Host window, open a workspace folder.
   - If the folder already contains `.witness/index.md`, the Witness status bar appears
     automatically.
   - If not, open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run
     `Witness: Initialize Project`.

---

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/architecture.md` | Extension source structure, artifact system, risk dimensions, v2/v3/v4 layers |
| `docs/workflow.md` | Developer workflow guide for v2/v3/v4 |
| `docs/product-ux-principles.md` | Locked UX principles and automatic/confirmed boundary |
| `docs/witness-agent-scope.md` | Locked product scope and out-of-scope boundaries |
| `docs/witness-conceptual-architecture.md` | Three-layer `.witness/` conceptual architecture |
| `docs/otel-evaluation-model.md` | OTel evaluation model |
| `docs/subagent-ledger-v0.2.md` | Subagent ledger direction document |
| `docs/v0.1-validation-report.md` | v1 validation report |
| `docs/v2-validation-report.md` | v2 validation report and regression checklist |
| `docs/v2-implementation-plan.md` | Full v2 specification and implementation notes |
| `docs/v3-implementation-plan.md` | Full v3 specification and implementation notes |
| `docs/v3-validation-report.md` | v3 validation report and regression checklist |
| `docs/v4-implementation-plan.md` | Full v4 specification and implementation notes |
| `docs/v4-validation-report.md` | v4 validation report and regression checklist |

---

## License

MIT. See [LICENSE](./LICENSE).
