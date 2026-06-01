# Witness Agent

Witness helps your AI coding sessions remember what matters.

Start:
1. Run `Witness: Start`
2. Answer what you are working on
3. Paste the prompt into your coding agent
4. Code normally

Lost?
Run `Witness: Cheatsheet`.

Witness Agent is a VS Code extension for AI-assisted coding workflows. It creates a repo-local
`.witness/` memory layer so Copilot, Claude Code, Codex, Superpowers, Cursor, or another coding
agent can resume project work with the right context.

AI coding sessions are temporary. Decisions, progress, constraints, and next steps can disappear
when a session ends. Witness keeps that project memory visible, reviewable, and easy to load into
the next coding-agent session.

Witness is not your coding agent. It does not call an LLM directly, automatically inject prompts,
or modify source code automatically. You decide what to paste and when.

---

## Quick Start

Open the Command Palette with `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux.

Run:

```text
Witness: Start
```

Witness initializes `.witness/` if needed, asks what you are working on, and opens a copy-ready
prompt. Paste that prompt into your coding agent, then keep coding normally.

---

## 5-Minute Workflow

1. `Witness: Start` when beginning AI-assisted work.
2. Paste the generated prompt into your coding agent.
3. Code normally.
4. Click the Witness status bar when it recommends action.
5. `Witness: Save Progress` before stopping.
6. `Witness: Switch Task` when moving to another task.
7. `Witness: Resume` when returning later.
8. `Witness: Cheatsheet` if you are lost.

---

## Main Commands

Most users should start with these workflow-first names:

| Command | Use when |
|---|---|
| `Witness: Start` | starting AI-assisted work |
| `Witness: Save Progress` | stopping soon |
| `Witness: Resume` | returning later |
| `Witness: Switch Task` | moving to another task |
| `Witness: Fix Issue` | Witness warns about a continuity issue |
| `Witness: Status` | you want to know what is happening |
| `Witness: Cheatsheet` | you are lost |
| `Witness: Update Memory` | you want your coding agent to update Witness memory |
| `Witness: Check Memory Update` | your coding agent changed `.witness/` files |

---

## Cheatsheet

Witness installs a one-page guide at:

```text
.witness/CHEATSHEET.md
```

Open it with:

```text
Witness: Cheatsheet
```

The cheatsheet answers: "What should I do now?"

---

## Status Bar

The Witness status bar shows current project-memory state. Hover for details. Click for actions.

The click menu is grouped like this:

| Section | What it contains |
|---|---|
| Recommended | the best next action for the current workspace |
| Main Actions | everyday workflow commands: Start, Save Progress, Resume, Switch Task, Status, Cheatsheet, Fix Issue |
| Maintenance | Update Memory and Check Memory Update |
| More Actions | extra, original, and advanced commands |

The tooltip still shows the detailed reason, such as stale project memory, missing handover,
pending review, or critical continuity risk.

---

## Prompt-Based Agent Integration

Witness works through copy-ready prompts.

```text
Witness generates the prompt -> You review and paste it -> Your coding agent acts
```

For maintenance:

1. Run `Witness: Update Memory`.
2. Paste the prompt into your coding agent.
3. Let the coding agent update allowed `.witness/` files.
4. Run `Witness: Check Memory Update`.
5. Review the result before trusting it.

Witness does not send prompts automatically and does not read hidden model reasoning.

---

## Manual / Advanced command names

These command names still exist for compatibility and advanced workflows. Most users should use
the shorter v8 names above.

| Manual / advanced name | Prefer |
|---|---|
| `Witness: Start with Witness` | `Witness: Start` |
| `Witness: Start Tracking This Task` | `Witness: Start` |
| `Witness: Create Checkpoint` | `Witness: Save Progress` |
| `Witness: Resume with Witness` | `Witness: Resume` |
| `Witness: Resolve Continuity Issue` | `Witness: Fix Issue` |
| `Witness: Update Project Memory with Agent` | `Witness: Update Memory` |
| `Witness: Validate Artifact Maintenance` | `Witness: Check Memory Update` |

Additional advanced commands remain available from the Command Palette under `Witness`, including
ADR, context packet, handover, subagent, risk, and evaluation commands.

---

## Installation And Local Setup

Witness is not published to the VS Code Marketplace yet. For now, install it from the included VSIX
file or run it locally from this repository.

### Install From VSIX

Open or create the VS Code project you want to use with Witness first. Then install the VSIX and
run Witness inside that project workspace.

Download or locate the packaged extension file:

```text
witness-agent-0.1.0.vsix
```

Install it from VS Code by running `Extensions: Install from VSIX...` from the Command Palette and
selecting the `.vsix` file.

You can also install it from the command line:

```bash
code --install-extension witness-agent-0.1.0.vsix
```

After installing, run `Witness: Start` in the project workspace you want Witness to assist.

### Run From Source

Use this path only when developing or testing the extension itself.

1. Clone and install:

   ```bash
   git clone https://github.com/ancuong1610/witness-agent-vscode.git
   cd witness-agent-vscode
   npm install
   ```

2. Open this folder in VS Code.
3. Press `F5` to launch an Extension Development Host window.
4. In the Extension Development Host, open the project you want Witness to assist.
5. Run `Witness: Start`.

---

## What Witness Creates

When enabled, Witness creates a `.witness/` directory inside your project.

```text
.witness/
  AGENTS.md
  CHEATSHEET.md
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

Key files:

| Path | Purpose |
|---|---|
| `.witness/CHEATSHEET.md` | one-page guide for what to do next |
| `.witness/index.md` | directory map and reading order |
| `.witness/current-state.md` | current project state and important context |
| `.witness/handovers/latest.md` | latest handover for resume |
| `.witness/sessions/` | session records and related artifacts |
| `.witness/checkpoints/` | saved progress artifacts |
| `.witness/AGENTS.md` | entry point for coding agents that need Witness instructions |
| `.witness/harness/` | protocol files for advanced workflows |
| `.witness/telemetry/` | local structured event log, not part of the default read set |

Do not load every `.witness/` file into a coding agent by default. Start with the prompt Witness
generates.

---

## Safety Boundaries

Witness keeps the developer in control.

- Witness is not your coding agent.
- Witness does not call an LLM directly.
- Witness does not manage API keys.
- Witness does not automatically inject prompts into AI chats.
- Witness does not modify source code automatically.
- Witness does not capture raw AI chat transcripts.
- Witness does not capture hidden model reasoning.
- Witness suggests and validates; the developer approves.

---

## Advanced Workflows

Advanced commands remain available for teams and power users:

- ADRs for decisions
- handovers for session transfer
- context packets for reviewed resume artifacts
- subagent ledger commands for delegated work
- risk assessment and evaluation summaries for diagnostics
- harness protocols for agent-maintenance workflows

You do not need these on day one.

---

## Current Status

v8.4 complete.

- 40 public commands
- 41 activation events
- 0 runtime dependencies
- workflow-first aliases implemented
- Witness Cheatsheet implemented
- status bar grouped by Recommended, Main Actions, Maintenance, and More Actions
- README and onboarding simplified around the v8 workflow surface

---

## Further Reading

The README is the first-user guide. Deeper implementation and workflow notes live in `docs/`.

| Document | Purpose |
|---|---|
| `docs/workflow.md` | Full Witness workflow and command phases |
| `docs/architecture.md` | Extension architecture and artifact system |
| `docs/product-ux-principles.md` | Product boundaries and UX principles |
| `docs/v8-implementation-plan.md` | v8 workflow-first command surface plan |
| `docs/v6-validation-report.md` | v6 validation results |

---

## License

MIT. See [LICENSE](./LICENSE).
