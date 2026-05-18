# Witness Agent

Witness Agent is a VS Code background continuity assistant for AI-assisted coding workflows.

---

## The Problem

AI coding sessions are ephemeral. When a session ends, the model loses all working memory — what
was decided, which files were mid-edit, what subagents were dispatched, and why certain constraints
exist. Decisions, context, delegated work, and handovers can be silently lost at every session
boundary.

Witness Agent addresses this by externalizing continuity into `.witness/`: a repo-local directory
of structured artifacts that a fresh session can load selectively to resume safely. The core
principle is **store broadly, compress carefully, load minimally, validate resume quality**.

---

## How Witness Feels During Normal Use

You code normally. The Witness status bar item watches quietly in the background.

If a continuity issue arises — a subagent task pending review, a stale handover, a blocked
subagent, or a risk level that warrants a checkpoint — the status bar label changes and its color
shifts to indicate the issue.

When you want to know what's happening and what to do next:

1. **Click the status bar.** A QuickPick opens.
2. **Select `Resolve: <issue>`.** `Witness: Resolve Continuity Issue` runs.
3. **Read the explanation.** An unsaved markdown tab opens in the editor. It answers four questions:
   what happened, why it matters, what to do next, and what evidence Witness used.
4. **Choose an action.** A QuickPick of ranked action items follows. Select one to execute it, or
   press Escape to cancel.

No file is written, no session is switched, and no command executes until you make an explicit
selection at the action step. If you press Escape, nothing changes.

When things are going well, the status bar shows `Witness: OK` and you can ignore it entirely.

---

## Tutorial: Your First Witness Workflow

This tutorial walks through a complete Witness workflow from initialization to session resume.
Each step maps to a real command. Follow these steps in order the first time you use Witness on
a project.

### Step 1 — Open a project in VS Code

Open any project folder in VS Code.

- If the folder already contains `.witness/index.md`, the Witness status bar appears automatically.
  Skip to Step 3.
- If not, continue to Step 2.

### Step 2 — Initialize Witness

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

```
Witness: Initialize Project
```

This creates the `.witness/` directory and populates it with:

- `.witness/index.md` — directory map and reading order guide
- `.witness/current-state.md` — your single source of truth (fill this in after init)
- `.witness/handovers/` — validated handover documents
- `.witness/sessions/` — per-session records and context packets
- `.witness/subagents/` — subagent ledger entries
- `.witness/AGENTS.md` — agent entry point for coding agents
- `.witness/harness/` — agent-readable protocol files

After initializing, open `.witness/current-state.md` and fill in the current project state. This
is the most important thing to do before the first session — it is the source of truth a fresh
agent will read to resume your project.

### Step 3 — Start a Witness session

Run:

```
Witness: Start Session
```

When prompted, enter a short goal for the work block.

**A Witness session is not the same as a Copilot, Claude, Codex, or Superpowers chat session.**

- A **Witness session** is a repo-local tracking record for one development work block. It records
  what you intended to do, what Witness observed, and what artifacts were produced.
- A **coding-agent session** is the AI chat or context window (Copilot, Claude Code, Codex, etc.).

These are independent. You can start one Witness session and have multiple coding-agent
conversations during it, or switch coding agents mid-session. Witness does not control or monitor
the coding-agent chat.

**What to write in the session prompt:**

Write a short goal, scope, and expected outcome. Examples:

```
Goal: Implement login validation and update current-state before handover.
Scope: auth module, current-state.md, handover.
Expected outcome: passing tests, validated handover, context packet ready.
```

```
Goal: Investigate failing subagent ledger flow and record evidence.
Scope: subagents/subagent-003, evidence.md.
Expected outcome: root cause identified, evidence recorded, next action clear.
```

```
Goal: Validate Witness v4.7 in a fresh workspace.
Scope: initialize project, start session, create subagent ledger, resolve continuity issue.
Expected outcome: confirm harness files and resolver flow work.
```

Avoid vague goals: `work`, `continue`, `fix stuff`. These produce sessions that are useless as
resume artifacts.

### Step 4 — Code normally

Continue using your coding agent (Copilot, Claude Code, Codex, Superpowers, or any other tool)
exactly as you normally would. Witness does not control or intercept the coding agent. It watches
the `.witness/` directory state in the background.

Run these commands during the session as natural checkpoints:

- `Witness: Observe Workspace` — snapshot current git state (before delegating work or generating
  a handover)
- `Witness: Assess Continuity Risk` — evaluate the five risk dimensions when context is high or
  before a major decision
- `Witness: Create ADR` — record an architectural decision immediately when one is made

### Step 5 — Watch the status bar

The status bar item at the bottom of VS Code (`Witness: …`) reflects the current continuity state.

| Label | What it means |
|-------|---------------|
| `Witness: OK` | No immediate action needed. Continue working. |
| `Witness: No Session` | No active session. Run `Witness: Start Session`. |
| `Witness: Review Needed` | A subagent task or artifact needs human review. |
| `Witness: Risk Critical` | Risk level is RED or BLOCKED. Generate a handover now. |
| `Witness: Subagent Blocked` | A subagent task is blocked or failed. |
| `Witness: Stale Artifacts` | Handover or current state is stale. Consider a checkpoint. |
| `Witness: Setup Needed` | `.witness/` not found. Run `Witness: Initialize Project`. |

Click the status bar at any time to open a QuickPick of available actions.

### Step 6 — Resolve an issue

When the status bar shows anything other than `Witness: OK`, click it and select
**`Resolve: <issue>`** from the QuickPick. This runs:

```
Witness: Resolve Continuity Issue
```

An unsaved markdown tab opens in the editor. It answers four questions:

1. What happened?
2. Why does it matter?
3. What should I do next?
4. What evidence did Witness use?

After reading, a QuickPick of ranked action items appears. Select an action to execute it, or
press Escape to cancel and do nothing. **No file is written and no command runs until you make an
explicit selection.**

### Step 7 — Use the Subagent Ledger only when needed

Not every delegated task needs a full subagent ledger. Use the three ledger levels from the
Progressive Subagent Ledger (`.witness/harness/orchestrator.md`):

| Level | When to use | Witness commands |
|-------|-------------|-----------------|
| **Level 0 — No Ledger** | Tiny, easily reversible tasks with no review needed | None |
| **Level 1 — Lightweight Ledger** | Normal delegated work, one or two files, optional review | Start Task → Record Evidence |
| **Level 2 — Full Ledger** | Multi-file, high-risk, blocked, or requires integration review | Start Task → Context Packet → Record Evidence → Complete → Review |

When in doubt, start with Level 1. You can add stages as the task scope grows. For full ledger
guidance, see `.witness/harness/orchestrator.md` in your initialized workspace.

### Step 8 — Prepare a session switch

Before ending a meaningful work block, run:

```
Witness: Prepare Session Switch
```

This is a guided four-step sequence:

1. **Generate Handover** — renders a complete handover document from available session artifacts
2. **Validate Handover** — checks the handover against rule classes; must pass before use
3. **Create Resume Probe** — generates a quiz for validating handover quality from a fresh
   agent's perspective
4. **Create Context Packet** — assembles a reviewed context packet for the next session

Each step can be cancelled individually. Review the context packet before relying on it.

### Step 9 — Resume later

When returning to the project in a fresh coding-agent session, load only:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

If a reviewed context packet exists from the previous session, use it as the primary resume
artifact instead of or alongside the three files above.

**Do not load all `.witness/` files by default.** Do not load raw telemetry by default. Pull ADRs,
subagent entries, and evaluation reports on demand when a task specifically requires them.

Run `Witness: Resume Session` to browse available context packets and choose a resumption action.
Then run `Witness: Start Session` to open a new tracking record for the new work block.

---

## Common Beginner Questions

### Do I need to start a new Copilot/Claude/Codex chat when I start a Witness session?

No. A Witness session is separate from the coding-agent chat session. Start a Witness session to
create a tracking record for the development work block. Use your coding agent normally within
that session. You can have multiple coding-agent conversations during a single Witness session.

### When should I start a new Witness session?

Start one when beginning a meaningful work block, after a long break, after switching goals, or
before doing work you want to be able to trace. You do not need a new Witness session for every
single coding-agent prompt — only for distinct work blocks that represent a logical unit of
progress.

### What should I write in the Start Session prompt?

A short goal, scope, and expected outcome. One or two sentences is enough. The session record is
a resume artifact — write something a fresh agent could read to understand what this session was
for and what it produced.

### Does Witness automatically send context to my coding agent?

No. Witness does not inject `.witness/` files or context packets into any coding-agent session.
The developer decides when to load files and what to include. Context packets are
developer-reviewed artifacts.

### Does every subagent task need a full ledger?

No. Use the Progressive Subagent Ledger levels: Level 0 (no ledger), Level 1 (lightweight), Level
2 (full lifecycle). Reserve the full ledger for high-risk or multi-file work that requires an
integration review. See `.witness/harness/orchestrator.md` for the decision rules.

---

## Quick Start

This extension is not yet published to the VS Code Marketplace. To run it locally:

1. Clone the repository and install dependencies:
   ```
   git clone <repo-url>
   cd witness-agent-vscode
   npm install
   ```

2. Open the folder in VS Code and press `F5` to launch an Extension Development Host window.

3. In the Extension Development Host, open a project workspace folder.

4. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run **`Witness: Initialize Project`**.
   This creates the `.witness/` directory, all templates, and the Agent Harness Pack files.

5. Run **`Witness: Start Session`**. Provide a brief session goal. The status bar reflects the new
   session.

6. Load the default read set into your coding agent:
   - `.witness/index.md`
   - `.witness/current-state.md`
   - `.witness/handovers/latest.md`

7. Code normally. When the status bar changes, click it and use `Resolve Continuity Issue` to
   understand the issue and choose an action.

> If the workspace already contains `.witness/index.md`, the status bar appears automatically
> when VS Code opens — no command palette action required.

---

## Normal Workflow

```
Initialize Project
  → Start Session
  → Code normally (Witness watches in the background)
  → Click status bar → Resolve Continuity Issue (when needed)
  → Use Subagent Ledger for any delegated work
      (Start Subagent Task → Record Evidence → Complete → Review)
  → Prepare Session Switch (Generate Handover → Validate → Context Packet)
  → Next session: Resume Session → load context packet → Start Session
```

See `docs/workflow.md` for a full phase-by-phase guide.

---

## What `.witness/` Contains

| Path | Purpose |
|------|---------|
| `index.md` | Directory map and reading order guide |
| `current-state.md` | Single source of truth for current project state |
| `constitution.md` | Continuity rules, risk vocabulary, behavioral contracts |
| `commands.md` | Command palette cheat sheet |
| `handovers/` | Validated handover documents; `latest.md` is the most recent |
| `sessions/` | Per-session records, context packets, snapshots |
| `subagents/` | Subagent invocation records and v2 ledger directories |
| `decisions/` | Architectural Decision Records (ADRs) |
| `telemetry/` | Structured local OTel-style event log (not part of default read set) |
| `templates/` | Blank templates for runtime use |
| `AGENTS.md` | Agent entry point: default read set, constraints, harness index |
| `harness/` | Agent-readable protocol files for resume, subagent tasks, issues, session switches, and orchestrator workflows |

---

## Default Fresh-Session Read Set

When starting a fresh coding agent session, load exactly these three files:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

Do not load all `.witness/` files by default. Do not load raw telemetry by default. Pull ADRs,
subagent ledger entries, and validation reports on demand only when the task specifically requires
them.

If a reviewed context packet exists from a previous session
(`.witness/sessions/<session-id>-context-packet-NNN.md`), load that instead of or alongside the
three files above. Use `Witness: Create Context Packet` to generate and review a packet.

---

## Agent Harness Pack

`Witness: Initialize Project` creates a set of agent-readable files under `.witness/harness/`
and a top-level `.witness/AGENTS.md` entry point. These give coding agents structured instructions
for consuming `.witness/` artifacts safely.

| File | Purpose |
|------|---------|
| `.witness/AGENTS.md` | Entry point: default read set, constraints, and links to protocol files |
| `.witness/harness/agent-resume.md` | How to resume a session safely from a context packet |
| `.witness/harness/subagent-task.md` | How to execute a subagent task from a contract |
| `.witness/harness/continuity-issue.md` | How to handle a continuity issue when one is present |
| `.witness/harness/session-switch.md` | Protocol for ending a session and preparing for handoff |
| `.witness/harness/orchestrator.md` | When and how to use No Ledger, Lightweight Ledger, or Full Ledger for orchestrator-style workflows |

**Important:** Coding agents can use these files when the developer loads or references them.
Witness does not automatically inject these files into any coding agent session. The harness files
do not integrate with any coding agent API.

The Orchestrator Harness Guide (`.witness/harness/orchestrator.md`) applies to Codex, Superpowers,
Claude Code, Copilot, and any workflow that delegates bounded tasks to subagents. It is not a
tool-specific integration — it is a markdown file the developer or agent reads when it is needed.

---

## Key Commands

Run these from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | When to use |
|---------|-------------|
| `Witness: Initialize Project` | Once per workspace, before first session |
| `Witness: Start Session` | Beginning of each coding agent session |
| `Witness: Show Workspace Status` | Check current continuity state at a glance |
| `Witness: Resolve Continuity Issue` | Understand the top issue and choose an action |
| `Witness: Checkpoint Now` | Quick checkpoint: observe → assess risk → choose follow-up |
| `Witness: Prepare Session Switch` | Guided end-of-session: handover → validate → context packet |
| `Witness: Resume Session` | Browse context packets and choose a resumption action |
| `Witness: Start Subagent Task` | Begin a tracked subagent delegation |
| `Witness: Review Subagent Task` | Write the integration decision after a subagent completes |
| `Witness: Generate Evaluation Summary` | Produce a deterministic artifact-based session summary |

Full command reference: `.witness/commands.md` and `docs/workflow.md`.

### Full Command Reference (23 commands)

#### Group 1: Project and Session Foundation

| Command | Purpose |
|---------|---------|
| `Witness: Initialize Project` | Create the `.witness/` directory structure in the current workspace |
| `Witness: Start Session` | Open a new session record and set the active session pointer |

#### Group 2: Context and Workspace State

| Command | Purpose |
|---------|---------|
| `Witness: Record Context Snapshot` | Capture a context pressure measurement for the active session |
| `Witness: Observe Workspace` | Snapshot git state and workspace artifacts into a session observation file |
| `Witness: Assess Continuity Risk` | Guide a five-dimension continuity risk assessment and write the result |
| `Witness: Compress Current State` | Snapshot and archive `current-state.md` then open it for manual trimming |

#### Group 3: Decisions and Handover

| Command | Purpose |
|---------|---------|
| `Witness: Create ADR` | Generate a new Architectural Decision Record in `.witness/decisions/` |
| `Witness: Generate Handover` | Render a complete handover document from all available session artifacts |
| `Witness: Validate Handover` | Run rule classes against the most recent handover |
| `Witness: Create Resume Probe` | Generate a per-handover probe for validating resume quality |
| `Witness: Create Context Packet` | Assemble a reviewed context packet for starting a fresh session |

#### Group 4: Subagent Tracking (v1 model)

| Command | Purpose |
|---------|---------|
| `Witness: Record Subagent Report` | Write a v1 flat subagent invocation record to `.witness/subagents/` |

#### Group 5: Subagent Ledger Lifecycle (v2 model)

| Command | Purpose |
|---------|---------|
| `Witness: Start Subagent Task` | Create a contract for a new subagent task (ledger entry) |
| `Witness: Create Subagent Context Packet` | Assemble and record the context given to a subagent |
| `Witness: Record Subagent Evidence` | Record what the subagent actually did after execution |
| `Witness: Complete Subagent Task` | Write the completion report for a subagent task |
| `Witness: Review Subagent Task` | Write the orchestrator review and integration record |

#### Group 6: Background Continuity and Guided Workflows (v3/v4)

| Command | Purpose |
|---------|---------|
| `Witness: Show Workspace Status` | Open a markdown status report computed from `.witness/` artifacts |
| `Witness: Checkpoint Now` | Guided three-step checkpoint: observe → assess risk → choose follow-up |
| `Witness: Prepare Session Switch` | Guided four-step sequence to prepare artifacts before switching sessions |
| `Witness: Resume Session` | Browse available context packets and choose a resumption action |
| `Witness: Generate Evaluation Summary` | Generate a deterministic artifact-based evaluation summary for the session |
| `Witness: Resolve Continuity Issue` | Translate the top continuity issue into a readable explanation and guided QuickPick |

---

## What Witness Is Not

**Witness is not a coding agent.** It does not write code, execute tasks, or communicate with any
AI backend at runtime.

**Witness is not a replacement for Copilot, Claude Code, Codex, or any coding agent.** It is a
continuity, context-control, and tracing layer that runs beside the tool you are already using.

**Witness does not automatically inject context into coding agent sessions.** Context packets are
developer-reviewed artifacts. The developer decides when and what to load.

**Witness does not directly detect hidden model context rot or true token pressure.** It tracks
observable continuity degradation signals across five dimensions and surfaces them for developer
confirmation.

**Witness is not an automatic session switcher.** Session boundaries are deliberate developer
decisions. Witness surfaces risk signals; the developer acts.

**Explicit non-goals (locked):**
- No second dashboard the developer must constantly monitor
- No automatic rewriting of `current-state.md`
- No automatic handover generation without developer confirmation
- No automatic subagent review or integration
- No automatic session switching
- No automatic injection of context into coding-agent sessions
- No capture of raw AI chat transcripts
- No capture of hidden model reasoning

**The automatic / confirmed boundary (locked):**

Witness automatically: activates on workspace open, observes `.witness/` state, classifies
continuity risk, updates the status bar, and surfaces the resolver as the first QuickPick item
when an issue is active.

Witness requires developer confirmation before it: writes any artifact, reviews subagent work,
compresses current state, generates a handover, prepares a session switch, or starts a new session.

---

## The Five Continuity Risk Dimensions

`Witness: Assess Continuity Risk` evaluates five independent dimensions:

1. **Active Context Pressure** — how full the current session context window is
2. **Artifact Externalization Gap** — how much session state has not yet been persisted to `.witness/`
3. **Subagent Boundary Risk** — whether subagent work is traceable and integrated
4. **Quality Drift** — whether the session is showing signs of observable continuity degradation
5. **Phase Boundary Risk** — whether the session is approaching a natural handoff point

Risk levels: GREEN, YELLOW, ORANGE, RED, BLOCKED. High risk means preserve context first
(generate and validate a handover), then switch — not switch immediately.

---

## Current Status

v4.7 complete. 23 public commands. 24 activation events. Agent Harness Pack included.

The v4 series added: automatic workspace activation, the guided continuity resolver
(`Witness: Resolve Continuity Issue`) with status bar integration, the Agent Harness Pack
(`.witness/AGENTS.md` and five protocol files under `.witness/harness/`), and the Generic
Orchestrator Harness Guide. All 23 commands compile cleanly with zero TypeScript errors.

See `docs/v4-implementation-plan.md` and `docs/v4-validation-report.md` for the full v4 record.
Earlier milestones are documented in `docs/v2-implementation-plan.md`, `docs/v2-validation-report.md`,
`docs/v3-implementation-plan.md`, and `docs/v3-validation-report.md`.

---

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/workflow.md` | Developer workflow guide: phase-by-phase with all commands |
| `docs/architecture.md` | Extension source structure, artifact system, risk dimensions, v2/v3/v4 layers |
| `docs/product-ux-principles.md` | Locked UX principles and automatic/confirmed boundary |
| `docs/v4-implementation-plan.md` | Full v4 specification and implementation notes |
| `docs/v4-validation-report.md` | v4 validation report (includes v4.6 and v4.7 addenda) |
| `docs/v3-implementation-plan.md` | Full v3 specification and implementation notes |
| `docs/v3-validation-report.md` | v3 validation report and regression checklist |
| `docs/v2-implementation-plan.md` | Full v2 specification and implementation notes |
| `docs/v2-validation-report.md` | v2 validation report and regression checklist |
| `docs/witness-agent-scope.md` | Locked product scope and out-of-scope boundaries |
| `docs/witness-conceptual-architecture.md` | Three-layer `.witness/` conceptual architecture |
| `docs/otel-evaluation-model.md` | OTel evaluation model |
| `docs/subagent-ledger-v0.2.md` | Subagent ledger direction document |

---

## License

MIT. See [LICENSE](./LICENSE).
