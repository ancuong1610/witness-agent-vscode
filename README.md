<img width="1197" height="759" alt="Screenshot 2026-05-18 at 23 14 57" src="https://github.com/user-attachments/assets/9fbe3bf2-a628-4fc6-a009-a0ca9a60e757" />
# Witness Agent

Witness Agent is a VS Code background continuity assistant for AI-assisted coding workflows.

---

## The Problem

AI coding sessions are ephemeral. When a session ends, the model loses all working memory — what
was decided, which files were mid-edit, what subagents were dispatched, and why certain constraints
exist. Decisions, context, delegated work, and handovers can be silently lost at every session
boundary.

Witness addresses this by externalizing continuity into `.witness/`: a repo-local directory of
structured artifacts that a fresh coding-agent session can load selectively to resume safely.

You keep coding normally with Copilot, Claude Code, Codex, Superpowers, or another coding agent.
Witness runs in the background and helps your coding agent remember the project safely.

**Witness is not your coding agent. It helps your coding agent remember the project safely.**

---

## The 5-Minute Workflow

This is all you need to get started.

1. **Enable Witness** — run `Witness: Enable for This Project` once per project.
2. **Start Tracking This Task** — run `Witness: Start Tracking This Task` and answer
   "What are you working on?" Witness opens a copy-ready prompt to paste into your coding agent.
3. **Code normally** — use your coding agent as usual. Witness watches the status bar quietly.
4. **Click Witness when it warns you** — if the status bar shows anything other than
   `Witness: OK`, click it and select the recommended action.
5. **Create Checkpoint before stopping** — run `Witness: Create Checkpoint` to save enough
   project memory for a later AI session.
6. **Resume with Witness next time** — run `Witness: Resume with Witness` to generate a
   copy-ready resume prompt for your next coding-agent session.

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

3. In the Extension Development Host, open a project folder.

4. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:
   ```
   Witness: Enable for This Project
   ```
   This creates `.witness/` and opens a beginner onboarding page.

5. Run:
   ```
   Witness: Start Tracking This Task
   ```
   Enter a short goal. Witness opens a copy-ready prompt to paste into your coding agent.

If `.witness/index.md` already exists in the workspace, Witness activates automatically and the
status bar appears — no Command Palette action required.

---

## Tutorial: Your First Witness Workflow

This tutorial walks through a complete Witness workflow using the beginner commands. Follow these
steps in order the first time you use Witness on a project.

### Step 1 — Enable Witness

Open the Command Palette and run:

```
Witness: Enable for This Project
```

This creates the `.witness/` directory, populates it with templates and harness files, and opens
a beginner onboarding page explaining what to do next. If Witness is already enabled, the command
says so and offers to show the onboarding page again.

You only need to do this once per project.

### Step 2 — Start Tracking This Task

Run:

```
Witness: Start Tracking This Task
```

Witness asks one question: **What are you working on?**

Enter a short, specific goal. After you answer, Witness:

1. Creates a repo-local session record in `.witness/sessions/`.
2. Opens a copy-ready prompt in a new editor tab.
3. Shows a notification with a **Copy Prompt** button.

Paste that prompt into your coding agent at the start of your session. It tells the agent which
Witness files to read before doing any work.

**A Witness session is not the same as a Copilot, Claude, Codex, or Superpowers chat session.**

- A **Witness session** is a repo-local tracking record for one development work block. It records
  what you intended to do, what Witness observed, and what artifacts were produced.
- A **coding-agent session** is the AI chat or context window (Copilot, Claude Code, Codex, etc.).

These are independent. You do not need to start a new coding-agent chat when you start a Witness
session.

Good goal examples:

```
Implement login validation and update current-state before handover.
```

```
Investigate failing subagent ledger flow and record evidence.
```

```
Validate Witness onboarding in a fresh workspace.
```

Avoid vague goals: `work`, `continue`, `fix stuff`. Vague goals produce sessions that are useless
as resume artifacts. Witness warns you and offers a chance to refine before continuing.

### Step 3 — Code Normally

Continue using your coding agent (Copilot, Claude Code, Codex, Superpowers, or any other tool)
exactly as you normally would.

Witness does not control the coding agent. It watches the `.witness/` directory state in the
background. You do not need to do anything unless the status bar changes.

### Step 4 — Use the Status Bar

The status bar item at the bottom of VS Code (`Witness: …`) reflects the current continuity state.

| Label | What it means |
|-------|---------------|
| `Witness: OK` | No immediate action needed. Continue working. |
| `Witness: No Session` | No active task record. Run `Witness: Start Tracking This Task`. |
| `Witness: Checkpoint` | A checkpoint or compression step is recommended. |
| `Witness: Review Needed` | A subagent task or artifact needs review. |
| `Witness: Attention` | A critical continuity issue is present. Act before continuing. |

**Hover** over the status bar item to see a summary: active session, suggested action, artifact
ages, subagent health, and telemetry state.

**Click** the status bar to open a beginner-first action menu with three sections:

- **Recommended** — one context-aware top action for the current state.
- **Beginner Actions** — five beginner-safe commands.
- **Advanced Actions** — all existing advanced commands, available but out of the way.

### Step 5 — Resolve Issues

When the status bar shows anything other than `Witness: OK`, click it and select the recommended
item (usually `Resolve: <issue>`). This runs:

```
Witness: Resolve Continuity Issue
```

Witness opens a markdown explanation answering four questions:

1. What happened?
2. Why does it matter?
3. What should I do next?
4. What evidence did Witness use?

After reading, a QuickPick of ranked actions appears. Select an action to execute it, or press
Escape to cancel. **No file is written and no command runs until you make an explicit selection.**

### Step 6 — Create Checkpoint

Before stopping work for the day or switching to a different task, run:

```
Witness: Create Checkpoint
```

This is the beginner-friendly way to save enough project memory for a later AI session to resume
safely. It runs a workspace observation, then asks whether you want to open `current-state.md` for
a quick manual update. It does not force the five-dimension risk questionnaire.

### Step 7 — Resume with Witness

When returning to the project in a fresh coding-agent session, run:

```
Witness: Resume with Witness
```

Witness scans for the latest reviewed context packet and opens a copy-ready resume prompt in a new
editor tab. Paste that prompt into your coding agent. The prompt tells the agent which files to
read and how to summarize the project state before doing any work.

No automatic injection occurs. You decide what to load and when.

---

## Beginner Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and type `Witness`:

| Command | What it does |
|---------|-------------|
| `Witness: Enable for This Project` | Create `.witness/` and open the onboarding page |
| `Witness: Start Tracking This Task` | Begin a tracked work block and get a copy-ready agent prompt |
| `Witness: Create Checkpoint` | Save enough project memory for a later AI session |
| `Witness: Resume with Witness` | Generate a copy-ready resume prompt |
| `Witness: Resolve Continuity Issue` | Explain and resolve the current top Witness issue |
| `Witness: Show Workspace Status` | Open the detailed Witness status report |

---

## What `.witness/` Contains

| Path | Purpose |
|------|---------|
| `.witness/index.md` | Directory map and reading order guide |
| `.witness/current-state.md` | Single source of truth for current project state |
| `.witness/handovers/latest.md` | Most recently validated session handover |
| `.witness/sessions/` | Per-session records, observations, context packets |
| `.witness/subagents/` | Subagent invocation records and v2 ledger entries |
| `.witness/AGENTS.md` | Agent entry point: default read set, constraints, harness index |
| `.witness/harness/` | Agent-readable protocol files for resume, tasks, issues, and session switches |
| `.witness/telemetry/` | Structured local event log (not part of the default read set) |

---

## Default Read Set

When starting a fresh coding-agent session, load exactly these three files:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

Do not load all `.witness/` files by default. Do not load raw telemetry by default. Pull ADRs,
subagent ledger entries, and evaluation reports on demand only when a task specifically requires
them.

If a reviewed context packet exists from a previous session
(`.witness/sessions/<session-id>-context-packet-NNN.md`), use it as the primary resume artifact
instead of or alongside the three files above.

---

## Agent Harness Pack

`Witness: Enable for This Project` creates a set of agent-readable files under `.witness/harness/`
and a top-level `.witness/AGENTS.md` entry point.

| File | Purpose |
|------|---------|
| `.witness/AGENTS.md` | Entry point: default read set, constraints, and links to protocol files |
| `.witness/harness/agent-resume.md` | How to resume a session safely from a context packet |
| `.witness/harness/subagent-task.md` | How to execute a subagent task from a contract |
| `.witness/harness/continuity-issue.md` | How to handle a continuity issue when one is present |
| `.witness/harness/session-switch.md` | Protocol for ending a session and preparing for handoff |
| `.witness/harness/orchestrator.md` | When and how to use No Ledger, Lightweight Ledger, or Full Ledger |

Coding agents can use these files when the developer loads or references them. Witness does not
automatically inject these files into any coding-agent session. The harness files do not integrate
with any coding-agent API.

---

## Progressive Subagent Ledger

Not every delegated task needs a full ledger. Use the level that fits the task:

| Level | When to use |
|-------|-------------|
| **Level 0 — No Ledger** | Tiny, easily reversible tasks. No tracking needed. |
| **Level 1 — Lightweight Ledger** | Normal delegated work. Start Task and Record Evidence. |
| **Level 2 — Full Ledger** | Multi-file, high-risk, or requires integration review. Full lifecycle. |

When in doubt, start with Level 1. For decision rules and examples, see
`.witness/harness/orchestrator.md` in your initialized workspace.

---

## What Witness Is Not

**Witness is not a coding agent.** It does not write code, execute tasks, or communicate with any
AI backend at runtime.

**Witness is not a replacement for Copilot, Claude Code, Codex, or any coding agent.** It is a
continuity, context-control, and tracing layer that runs beside the tool you are already using.

**Witness does not automatically inject context into coding-agent sessions.** Context packets are
developer-reviewed artifacts. The developer decides when and what to load.

**Witness detects observable continuity degradation from `.witness/` artifacts. It does not
directly detect hidden model context rot or true token pressure.**

**Witness does not automatically switch sessions.** Session boundaries are deliberate developer
decisions. Witness surfaces risk signals; the developer acts.

Non-goals (locked):

- No automatic rewriting of `current-state.md`
- No automatic handover generation without developer confirmation
- No automatic subagent review or integration
- No automatic session switching
- No automatic injection of context into coding-agent sessions
- No capture of raw AI chat transcripts
- No capture of hidden model reasoning

---

## Advanced Commands and Documentation

The full command reference (all 27 commands) is available in:

- `.witness/commands.md` (installed with every project)
- `docs/workflow.md`

Additional documentation:

| Document | Purpose |
|----------|---------|
| `docs/architecture.md` | Extension source structure and artifact system |
| `docs/workflow.md` | Phase-by-phase developer workflow guide |
| `docs/product-ux-principles.md` | Locked UX principles and automatic/confirmed boundary |
| `docs/v5-implementation-plan.md` | v5 specification and implementation notes |
| `docs/v4-validation-report.md` | v4 validation report |

---

## Current Status

v5.4a complete. 27 public commands. 28 activation events. No runtime dependencies.

The beginner workflow is fully implemented: Enable for This Project, Start Tracking This Task,
Create Checkpoint, Resume with Witness, Resolve Continuity Issue, first-run onboarding page,
beginner-first status bar QuickPick, and rich hover tooltip. Advanced commands remain fully
available via the Command Palette and the Advanced Actions section of the status bar QuickPick.

---

## License

MIT. See [LICENSE](./LICENSE).
