<img width="1197" height="759" alt="Witness Agent screenshot" src="https://github.com/user-attachments/assets/9fbe3bf2-a628-4fc6-a009-a0ca9a60e757" />

# Witness Agent

Witness Agent is a VS Code extension that helps your existing coding agent remember what matters
between sessions.

Use Copilot, Claude Code, Codex, Superpowers, or another coding agent as usual. Witness runs beside
that tool inside VS Code and keeps a repo-local `.witness/` folder with project memory, checkpoints,
handover notes, and resume prompts.

Witness is not a coding agent. It does not call an LLM, write code for you, or replace your current
AI coding tool. It helps your coding agent remember the project safely when you decide to load the
saved context.

If Witness helps your workflow, please consider giving the repository a star so other developers
can find it.

---

## The Problem

AI coding sessions are ephemeral. When a session ends, the model loses all working memory: what was
decided, which files were mid-edit, what subagents were dispatched, and why certain constraints
exist. Decisions, context, delegated work, and handovers can be silently lost at every session
boundary.

Witness addresses this by externalizing continuity into `.witness/`: a repo-local directory of
structured artifacts that a fresh coding-agent session can load selectively to resume safely.

You keep coding normally with Copilot, Claude Code, Codex, Superpowers, or another coding agent.
Witness runs in the background and helps your coding agent remember the project safely.

**Witness is not your coding agent. It helps your coding agent remember the project safely.**

---

## How Witness Fits Your Workflow

Witness sits between your project and your coding agent.

<img width="6151" height="1543" alt="mermaid-diagram" src="https://github.com/user-attachments/assets/d173a1d0-4859-4230-8296-8ef6649414a7" />


The boundary is simple:

- You keep coding in your normal coding agent.
- Witness watches the continuity state through `.witness/`.
- Witness gives you prompts, checkpoints, status warnings, and validation.
- You decide what context to paste into the coding agent and when.

No automatic prompt injection happens. No hidden AI provider call happens.

---

## Installation And Local Setup

Witness is not published to the VS Code Marketplace yet. Run it locally from this repository.

1. Clone and install:

   ```bash
   git clone <repo-url>
   cd witness-agent-vscode
   npm install
   ```

2. Open this folder in VS Code.

3. Press `F5` to launch an Extension Development Host window.

4. In the Extension Development Host, open the project you want Witness to assist.

After the Extension Development Host is open, continue with the first-time workflow below.

---

## First-Time Workflow

Use this flow inside the Extension Development Host after opening the project you want Witness to
assist.

### 1. Enable Witness

Open the Command Palette with `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux, then run:

```text
Witness: Enable for This Project
```

This creates `.witness/` in the project and opens the beginner onboarding page.

If `.witness/index.md` already exists, Witness activates automatically when the workspace opens.

### 2. Start Tracking Your Task

Run:

```text
Witness: Start Tracking This Task
```

Witness asks what you are working on. Give it a specific goal, for example:

```text
Implement login validation and update current-state before handover.
```

Witness then creates a session record and opens a copy-ready prompt for your coding agent.

### 3. Paste The Prompt Into Your Coding Agent

Paste the prompt into Copilot, Claude Code, Codex, Superpowers, or whichever coding agent you use.

That prompt tells the agent which `.witness/` files to read before it starts work. Witness does not
send the prompt automatically.

### 4. Code Normally

Continue using your coding agent and editor as usual.

Witness stays in the background and updates the VS Code status bar when continuity needs attention.

### 5. Follow The Status Bar

The Witness status bar item shows the current continuity state. Click it when it is not
`Witness: OK`, or when you want a quick list of Witness actions.

### 6. Create A Checkpoint Before Stopping

Before you stop work, switch tasks, or close the coding-agent chat, run:

```text
Witness: Create Checkpoint
```

This saves enough project memory for a later session to understand where things stand.

### 7. Resume Later

When you return in a new coding-agent session, run:

```text
Witness: Resume with Witness
```

Witness opens a resume prompt. Paste that prompt into your coding agent so it can load the right
project memory before continuing.

---

## Visual Guide

This is the normal loop:

```text
Start work
   |
   v
Witness: Start Tracking This Task
   |
   v
Paste generated prompt into your coding agent
   |
   v
Code normally
   |
   v
Watch Witness status bar
   |
   +--> Witness: OK
   |       |
   |       v
   |    Keep coding
   |
   +--> Warning or recommendation
           |
           v
        Click status bar and follow the recommended action
           |
           v
        Create checkpoint, update memory, or resolve issue
           |
           v
        Resume safely later
```

Think of Witness as a project memory assistant:

```text
Start Tracking -> Work -> Checkpoint -> Resume
```

---

## How The Status Bar Works

The Witness status bar item appears in the bottom VS Code bar. It is informational by default and
does not run commands on its own.

Witness recomputes the status when:

- the extension activates
- a `.witness/` file is saved
- a workspace change affects the observed state
- you run a Witness command from the status bar QuickPick

The status bar reads `.witness/` artifact metadata such as active session, artifact age, latest
risk level, subagent health, context packet markers, and telemetry state. It does not read AI chat
transcripts or hidden model reasoning.

| Label | What it means | Recommended response |
|-------|---------------|----------------------|
| `Witness: OK` | Active session and artifacts look healthy | Keep working |
| `Witness: No Session` | Witness is enabled but no task/session is active | Run `Witness: Start Tracking This Task` |
| `Witness: Checkpoint` | A checkpoint or maintenance step is useful soon | Create a checkpoint or update memory |
| `Witness: Review Needed` | A warning exists, often stale artifacts or subagent review | Click the status bar and follow the top action |
| `Witness: Attention` | A critical continuity issue exists | Resolve before continuing |
| `Witness: No Workspace` | VS Code has no workspace folder open | Open a project folder |
| `Witness: Status Error` | Status could not be computed | Run `Witness: Show Workspace Status` |

When clicked, the status bar opens a QuickPick with three sections:

| Section | What it contains |
|---------|------------------|
| Recommended | One context-aware action, such as `Start Tracking This Task`, `Maintain: <reason>`, `Resolve: <issue>`, or `Create Checkpoint` |
| Beginner Actions | The safest everyday commands for new users |
| Advanced Actions | More specific commands for handovers, subagents, evaluation, and session switches |

The recommended item follows this priority:

1. If no status is available, open workspace status.
2. If no active session exists, start tracking the task.
3. If project memory maintenance is needed, generate an agent maintenance prompt.
4. If a continuity issue exists, open the guided resolver.
5. If everything is healthy, offer a checkpoint.

---

## What Witness Creates

When enabled, Witness creates a `.witness/` directory inside your project. This is the memory layer
that your future coding-agent sessions can read.

```text
.witness/
  AGENTS.md
  commands.md
  constitution.md
  current-state.md
  index.md
  checkpoints/
  decisions/
  evaluation/
  handovers/
  harness/
  sessions/
  subagents/
  telemetry/
  templates/
```

| Path | Purpose |
|------|---------|
| `.witness/index.md` | Directory map and reading order |
| `.witness/current-state.md` | Current project state and important context |
| `.witness/handovers/latest.md` | Latest validated handover for resume |
| `.witness/sessions/` | Session records, observations, risk files, context packets, and archived current-state snapshots |
| `.witness/subagents/` | Subagent task records and ledger entries |
| `.witness/checkpoints/` | Checkpoint artifacts used by the v6 maintenance flow |
| `.witness/decisions/` | ADRs for architectural or design decisions |
| `.witness/evaluation/` | Handover validation reports, resume probes, and session evaluation summaries |
| `.witness/AGENTS.md` | Entry point for coding agents that need Witness instructions |
| `.witness/harness/` | Protocol files for resume, tasks, issues, session switches, and maintenance contracts |
| `.witness/telemetry/` | Local structured event log, not part of the default read set |
| `.witness/templates/` | Templates used to create Witness artifacts |

### The Logic

Witness follows four rules:

- **Store broadly**: record sessions, observations, ADRs, subagent evidence, and handovers as
  artifacts instead of relying on chat memory.
- **Load minimally**: a fresh coding-agent session should not read the entire `.witness/` folder.
- **Review before reuse**: handovers, context packets, and agent-drafted maintenance should be
  reviewed before they are trusted.
- **Keep the developer in control**: Witness suggests and validates; the developer approves.

The default read set for a fresh coding-agent session is:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

If a reviewed context packet exists, use it as the main resume artifact:

```text
.witness/sessions/<session-id>-context-packet-NNN.md
```

Do not load every `.witness/` file by default. Pull extra files only when the task needs them.

---

## Subagent Ledger Mechanism

Witness includes a subagent ledger for workflows where your main coding agent delegates bounded
tasks to another agent. The ledger exists because subagent work has the same continuity problem as
normal AI sessions: once the subagent finishes, its working context disappears unless the parent
session records what happened.

The goal is to make subagent output reviewable instead of treating it as an unverified claim.

### When To Use It

Use the ledger when a delegated task is meaningful enough that a future session may need to know:

- what the subagent was asked to do
- what context the subagent received
- what evidence the subagent produced
- whether the parent session accepted or rejected the result
- what follow-up or integration work remains

For tiny, reversible tasks, a full ledger may be unnecessary. For normal delegated work, use the
five-stage ledger. For a quick backward-compatible note, use `Witness: Record Subagent Report`.

### The Five Stages

Each full ledger entry lives under:

```text
.witness/subagents/subagent-NNN/
```

The five files are created in order:

| Stage | File | Command | Purpose |
|-------|------|---------|---------|
| 1 | `contract.md` | `Witness: Start Subagent Task` | Defines the task goal, acceptance criteria, scope, and expected evidence before dispatch |
| 2 | `context-packet.md` | `Witness: Create Subagent Context Packet` | Records exactly what context the subagent receives |
| 3 | `evidence.md` | `Witness: Record Subagent Evidence` | Records what the subagent inspected, changed, ran, decided, and verified |
| 4 | `report.md` | `Witness: Complete Subagent Task` | States completion status against the acceptance criteria |
| 5 | `review.md` | `Witness: Review Subagent Task` | Records the parent-session review, acceptance decision, and integration actions |

The review is the closing step. Do not treat subagent work as integrated until the ledger has a
review file.

### How It Reduces Risk

The ledger gives the parent session a chain of evidence:

```text
Contract -> Context Packet -> Evidence -> Report -> Review
```

That chain answers the key continuity questions:

- Did the subagent have enough context?
- Did it stay inside the requested scope?
- Did it meet the acceptance criteria?
- What proof exists beyond the final answer?
- Did the parent session review and accept the result?

Witness uses this structure when computing subagent health for the status bar. Missing evidence,
missing reports, blocked tasks, failed tasks, and missing reviews can surface as `Witness: Review
Needed` or another recommended action.

### Lightweight vs Full Tracking

Witness supports two subagent recording styles:

| Style | Use it when | Artifact shape |
|-------|-------------|----------------|
| Lightweight report | You only need a short note for a simple delegation | `.witness/subagents/subagent-NNN.md` |
| Full ledger | You need traceable context, evidence, completion, and review | `.witness/subagents/subagent-NNN/contract.md`, `context-packet.md`, `evidence.md`, `report.md`, `review.md` |

When in doubt, use the full ledger. It is easier to skip unnecessary detail than to reconstruct
missing evidence after a session boundary.

---

## Command Guide

Open the Command Palette with `Cmd+Shift+P` or `Ctrl+Shift+P`, then type `Witness`.

### Beginner Commands

Use these first. They are the simplest path for most users.

| Command | Use it when | What it does |
|---------|-------------|--------------|
| `Witness: Enable for This Project` | You want to use Witness in a project for the first time | Creates `.witness/`, templates, harness files, and onboarding |
| `Witness: Start Tracking This Task` | You are starting a work block | Creates a session record and opens a copy-ready prompt for your coding agent |
| `Witness: Create Checkpoint` | You are about to stop, switch tasks, or want a saved project-memory point | Observes the workspace and optionally opens `current-state.md` for update |
| `Witness: Resume with Witness` | You are returning in a fresh coding-agent session | Opens a copy-ready resume prompt with the standard Witness read set |
| `Witness: Resolve Continuity Issue` | The status bar warns you or you want guided help | Explains the top issue, shows evidence, and offers ranked actions |
| `Witness: Update Project Memory with Agent` | Witness says maintenance is needed, or artifacts are stale | Generates a strict prompt for your coding agent to draft `.witness/` updates |
| `Witness: Validate Artifact Maintenance` | A coding agent has drafted `.witness/` changes | Checks that changes stayed inside `.witness/` and required sections exist |
| `Witness: Show Workspace Status` | You want a readable status report | Opens a deterministic markdown report without writing files |

### Project And Session Foundation

| Command | Use it when | What it does |
|---------|-------------|--------------|
| `Witness: Initialize Project` | You want the lower-level setup command instead of the beginner wrapper | Creates the `.witness/` structure and starter documents |
| `Witness: Start Session` | You want the lower-level session command instead of `Start Tracking This Task` | Creates a session file, telemetry folder, and active session pointer |

### Context And Workspace State

| Command | Use it when | What it does |
|---------|-------------|--------------|
| `Witness: Observe Workspace` | You want a point-in-time snapshot before handover, checkpoint, or delegation | Records branch, commit, dirty files, and recent commits |
| `Witness: Record Context Snapshot` | The coding-agent session feels long or context pressure is notable | Records an estimated context-pressure measurement |
| `Witness: Assess Continuity Risk` | You are near a phase boundary or before handover | Guides five risk dimensions and records the overall level |
| `Witness: Compress Current State` | `current-state.md` has become too long or stale | Archives the current file and opens the live file for manual trimming |

### Decisions And Handover

| Command | Use it when | What it does |
|---------|-------------|--------------|
| `Witness: Create ADR` | You make an architectural or product decision that future sessions must remember | Creates a numbered ADR under `.witness/decisions/` |
| `Witness: Generate Handover` | You are ending meaningful work | Creates a dated handover and updates `.witness/handovers/latest.md` |
| `Witness: Validate Handover` | After generating or editing a handover | Writes a validation report and flags missing sections, placeholders, or broken links |
| `Witness: Create Resume Probe` | The handoff is high-stakes and should be tested | Creates a quiz-style probe to check whether the handover is usable |
| `Witness: Create Context Packet` | You want one reviewed artifact for the next session | Combines current state and latest handover with references to supporting artifacts |

### Subagent Tracking

Use these when you delegate work to another agent and need a traceable handoff.

| Command | Use it when | What it does |
|---------|-------------|--------------|
| `Witness: Record Subagent Report` | You only need a lightweight flat record | Creates a single subagent report file |
| `Witness: Start Subagent Task` | You are dispatching a bounded subagent task | Creates a ledger contract with goal and acceptance criteria |
| `Witness: Create Subagent Context Packet` | Before giving context to the subagent | Creates a scoped context packet for that subagent only |
| `Witness: Record Subagent Evidence` | After the subagent finishes work | Records files inspected, files changed, actions, and deviations |
| `Witness: Complete Subagent Task` | The subagent has produced a result | Creates the completion report with status and gaps |
| `Witness: Review Subagent Task` | Before integrating subagent output | Records acceptance, conditions, rejection, and integration actions |

### Guided Workflows

These commands orchestrate several smaller commands while preserving developer confirmation.

| Command | Use it when | What it does |
|---------|-------------|--------------|
| `Witness: Checkpoint Now` | You want a fuller checkpoint than the beginner checkpoint | Runs workspace observation, risk assessment, then asks for a follow-up |
| `Witness: Prepare Session Switch` | You are ending a meaningful session and want a full handoff package | Runs handover generation, validation, resume probe, and context packet creation |
| `Witness: Resume Session` | You want to resume from an existing context packet | Opens a selected context packet and offers resume follow-up actions |

### Evaluation

| Command | Use it when | What it does |
|---------|-------------|--------------|
| `Witness: Generate Evaluation Summary` | You want a deterministic report for a session | Summarizes command activity, artifacts, risk, subagents, handovers, and observable degradation signals |

---

## Agent-Assisted Maintenance

Witness can help keep project memory current without taking control away from you.

When Witness detects that project memory needs maintenance, run:

```text
Witness: Update Project Memory with Agent
```

Witness opens a strict prompt for your coding agent. The prompt limits the agent to specific
`.witness/` files and tells it not to touch application source code.

After the coding agent drafts updates, run:

```text
Witness: Validate Artifact Maintenance
```

Witness checks the drafted artifacts and opens a validation report for your review.

The boundary is:

```text
LLM may draft. Witness validates. Developer approves.
```

---

## What Witness Does Not Do

Witness is deliberately limited.

- It does not replace your coding agent.
- It does not call an LLM directly.
- It does not manage API keys.
- It does not automatically inject context into AI chats.
- It does not automatically rewrite `current-state.md`.
- It does not automatically generate handovers without developer confirmation.
- It does not capture raw AI chat transcripts.
- It does not capture hidden model reasoning.
- It does not automatically switch sessions.

These limits are part of the design. Witness keeps continuity visible and reviewable.

---

## Current Status

v6 is complete.

- 29 public commands
- 30 activation events
- no runtime dependencies
- beginner workflow implemented
- status bar guidance implemented
- agent-assisted artifact maintenance implemented

---

## License

MIT. See [LICENSE](./LICENSE).
