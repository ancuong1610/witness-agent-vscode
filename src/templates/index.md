# Witness Index

This file is the entry point for the `.witness/` artifact system in this workspace. If you are a
fresh Copilot session or a developer orienting yourself after a break, start here.

---

## Directory Map

```
.witness/
├── constitution.md         — Continuity rules, risk vocabulary, and the Default Read Set
├── index.md                — This file. Start here.
├── current-state.md        — Single source of truth for current project state
├── commands.md             — Cheat sheet of Witness Agent command palette commands
├── templates/              — Blank templates for sessions, ADRs, handovers, and probes
│   ├── session-template.md
│   ├── context-pressure-template.md
│   ├── subagent-report-template.md
│   ├── adr-template.md
│   ├── handover-template.md
│   └── resume-probe-template.md
├── sessions/               — One file per Copilot session record
├── telemetry/              — Context pressure snapshots, indexed by session
├── subagents/              — Records of subagent invocations and their outputs
├── decisions/              — Architectural Decision Records (ADRs)
├── handovers/              — Validated handover documents, one per session boundary
└── evaluation/             — Resume probe results, one per handover
```

---

## Key Files

- **Rules and vocabulary**: [constitution.md](./constitution.md)
- **Current project state**: [current-state.md](./current-state.md)
- **Latest handover**: [handovers/latest.md](./handovers/latest.md) — always the most recently generated handover.
- **Command reference**: [commands.md](./commands.md)

---

## When Starting a Fresh Copilot Session, Read in This Order

This is the Default Read Set. Load these files before doing any work.

1. `.witness/index.md` — this file; orientation and directory map
2. `.witness/current-state.md` — where the project is right now
3. `.witness/handovers/latest.md` — the most recently generated handover
4. Any ADRs referenced in the handover that bear on your next step (in `decisions/`)
5. `.witness/commands.md` — optional orientation to available commands

Do not load everything. Load only what you need to take the next safe step. The handover will
tell you what that step is.

---

## How Records Are Named

| Type | Naming Convention | Example |
|------|------------------|---------|
| Session | `sessions/YYYY-MM-DD-NNN.md` | `sessions/2026-05-12-001.md` |
| Context Pressure | `telemetry/<session-id>/context-pressure-NNN.md` | `telemetry/2026-05-12-001/context-pressure-001.md` |
| Subagent Report | `subagents/subagent-NNN.md` | `subagents/subagent-001.md` |
| ADR | `decisions/ADR-NNNN-<slug>.md` | `decisions/ADR-0001-use-vscode-fs.md` |
| Handover | `handovers/handover-<session-id>-NNN.md` | `handovers/handover-2026-05-12-001-001.md` |
| Resume Probe | `evaluation/resume-probe-<handover-id>-NNN.md` | `evaluation/resume-probe-handover-2026-05-12-001-001-001.md` |

---

## Maintenance Note

This index file is not auto-updated by Witness Agent. When you add significant new records
(especially handovers or major ADRs), update `current-state.md` to reflect the new state. The
index itself only needs updating if the directory structure changes.
