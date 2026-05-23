# Witness Agent — Product UX Principles

**Locked as of**: v6 (2026-05-23)
**Applies to**: v3/v4 Background Continuity Layer and all future phases

---

## Core Product Principle

**Witness should reduce continuity workload, not create new workflow workload.**

The Background Continuity Assistant (v3) is designed so that a developer who ignores it completely
can still use Witness exactly as they did in v1/v2 — running commands manually from the command
palette when they need them. The v3 layer adds guidance without adding obligation.

---

## Product Vision

Witness Agent is a VS Code background continuity layer for AI-assisted coding. It monitors the
project's `.witness/` state, detects continuity risks, subagent issues, stale handovers, and
missing resume artifacts, then quietly suggests the next safe action. The developer continues
coding normally and only interacts with Witness when a checkpoint, review, or session transition
is needed.

---

## The Automatic / Confirmed Boundary

This boundary is locked. Crossing it without a new plan and explicit acceptance is a scope
violation.

### What Witness does automatically (no developer action or confirmation required)

- **Activate** — initializes the status bar when VS Code opens any workspace containing
  `.witness/index.md`, with no command palette invocation required
- **Observe** — reads `.witness/` artifact ages and states on file save, workspace open, and
  workspace folder change
- **Classify** — determines the current continuity state from artifact ages, session state,
  handover state, subagent health, and risk level
- **Warn** — updates the status bar item label and color to reflect the current state
- **Suggest** — surfaces the resolver as the first QuickPick item when an issue is active, and
  the suggested action command as the following item

The status bar is ambient information. The developer is never required to look at it or act on it.

### What Witness requires developer confirmation before doing

- **Write** — any artifact write to `.witness/` requires the developer to invoke a command and
  confirm any prompt or QuickPick
- **Review** — subagent task review is always developer-initiated
- **Compress** — `current-state.md` is only trimmed when the developer explicitly runs
  `Witness: Compress Current State`
- **Generate handover** — handovers are only generated when the developer explicitly requests them
- **Prepare session switch** — the guided switch workflow runs only when the developer invokes it
- **Start new session** — session switching is always developer-initiated

---

## Explicit Non-Goals (Locked)

These behaviors are explicitly out of scope. They may not be added without a new plan document,
explicit product acceptance, and a clearly documented rationale for crossing the confirmation
boundary.

| Non-goal | Why |
|----------|-----|
| Second dashboard the developer must constantly monitor | Adds workload, not reduces it |
| Automatic rewriting of `current-state.md` | Risk of data loss; requires developer judgment |
| Automatic handover generation without confirmation | Handovers contain developer decisions; quality depends on developer review |
| Automatic subagent review or integration | Integration decisions require developer context |
| Automatic session switching | Session boundaries are deliberate developer decisions |
| Automatic injection of context into coding-agent sessions | Context selection is developer-controlled by design |
| Capture of raw AI chat transcripts | Privacy boundary; not part of the `.witness/` artifact model |
| Capture of hidden model reasoning | Privacy boundary; not observable to the extension |

---

## UX Heuristics for Future Features

These heuristics apply when evaluating any proposed v4+ feature against this principle.

**1. Does it add a new thing the developer must regularly check?**
If yes, it violates the workload reduction principle unless the check replaces an existing one.

**2. Does it write to `.witness/` without developer confirmation?**
If yes, it crosses the automatic/confirmed boundary. Redesign to surface a suggestion instead.

**3. Does it require the developer to learn a new workflow step not present in v1/v2?**
If yes, it adds workload. It must also remove a step (or remove a class of errors) to be net-zero.

**4. Does it make a decision the developer would otherwise make manually?**
If yes, it is autonomous behavior. Witness is not an agent. Redesign to scaffold the decision
(open the right file, surface the options) rather than execute it.

**5. Is the feature invisible when things are going well?**
The best Witness features are ones the developer never needs to think about when the project is
healthy. If a feature is always visible, it adds workload by definition.

---

---

## v4 UX Principles

These principles were established during the v4 implementation (2026-05-18) and extend the core
principle above.

**The resolver answers four questions, not one.**
`Witness: Resolve Continuity Issue` always explains: what happened, why it matters, what to do
next, and what evidence is available. A single-sentence notification is not enough for continuity
decisions. The markdown preview exists precisely because continuity context requires more space
than a VS Code notification bubble.

**Notifications are short. Markdown previews are for explanation.**
Status bar labels are one phrase. Notification messages are one sentence. When more explanation
is needed, Witness opens an unsaved markdown tab — never a multi-paragraph notification. The
developer reads the preview in the editor and the QuickPick follows separately.

**The status bar is signal. The resolver markdown is explanation. The QuickPick is action.**
These are three distinct surfaces with distinct responsibilities. Do not conflate them. The status
bar never explains. The markdown never executes. The QuickPick never explains — it only lists
options and their descriptions.

**Existing commands are the write layer.**
`Witness: Resolve Continuity Issue` does not write anything itself. It scaffolds a path to the
right existing command. The existing commands (`recordSubagentEvidence`, `reviewSubagentTask`,
etc.) are the confirmed write layer. The resolver is the navigation layer.

**Stage-aware routing is better than generic routing.**
When the resolver identifies a subagent issue, it uses the subagent's actual stage data to select
the most precise next command — not a generic fallback. A ledger missing `evidence.md` routes to
`recordSubagentEvidence`; one missing `report.md` routes to `completeSubagentTask`. Generic
directory paths are never surfaced to the developer.

---

## v6 UX Principles

These principles were established during the v6 implementation (2026-05-23) and extend the core
principle above.

**Agent assistance must reduce maintenance work without reducing developer control.**

v6 introduces the first mechanism by which an active coding agent can draft `.witness/` artifact
content. The design constraint is that this assistance must not shift final authority from the
developer to the agent. The following sub-principles enforce that constraint.

**Prompts are explicit and copy-ready.**
The maintenance prompt is shown to the developer in full before any agent receives it. The
developer decides when and whether to use it. No silent injection occurs.

**Artifact-only mode is required for maintenance tasks.**
Every v6 maintenance prompt explicitly lists allowed write targets (`.witness/` files only) and
explicitly forbids modifying application source code, claiming tests passed without evidence,
and auto-approving changes. The coding agent may not enlarge its own scope.

**Validation is deterministic first.**
`validateArtifactMaintenance` is a pure synchronous function. It does not call an LLM to
evaluate artifact quality. Structural checks (file boundary, required sections, placeholder
markers) are evaluated deterministically. Semantic quality review remains the developer's
responsibility.

**Developer approval remains final.**
A validation result of `passed` is a structural finding, not a quality approval. The developer
reviews the validation report and the artifact content before accepting changes into the
repository. Witness does not merge, commit, or approve on the developer's behalf.

---

## Implemented Features

The following item was previously listed as a candidate. It is now implemented in v4.

### Witness: Resolve Continuity Issue (v4 — implemented)

Collapses "status bar shows warning → run command → navigate to artifact → decide" into a single
interaction: click status bar → select Resolve → read markdown preview → choose action from
QuickPick → Witness executes the selected existing command.

See `docs/v4-implementation-plan.md` for the full specification and implementation notes.
See `docs/v4-validation-report.md` for the validation record.

**Key constraint (unchanged)**: Witness opens the right artifact and scaffolds the resolution
QuickPick. Witness does not decide, execute, or write without the developer choosing from the
presented options. The developer's explicit choice at the decision step is non-negotiable.

### Agent Harness Pack (v4.6 — implemented)

A set of agent-readable protocol files — `.witness/AGENTS.md` and four files under
`.witness/harness/` — that give coding agents structured instructions for consuming `.witness/`
artifacts safely. Created during `Witness: Initialize Project`. No new commands.

Coding agents can use these files when the developer loads or references them. The pack does not
integrate with any coding agent API, does not inject context automatically, and does not grant
agents autonomous write, review, or approval capabilities. It supports both manual developer
workflow and agent-assisted workflow without changing the automatic/confirmed boundary.

### Generic Orchestrator Harness Guide (v4.7 — implemented)

`.witness/harness/orchestrator.md` extends the Agent Harness Pack for orchestrator-style coding
workflows that delegate bounded tasks to subagents. It defines three ledger levels (No Ledger,
Lightweight Ledger, Full Ledger), a before-delegation checklist, multiple-subagent policy,
failure policy, and context minimization rules.

It applies to Codex-style, Superpowers-style, Claude Code-style, Copilot-style, and any future
orchestration pattern that reads project files and follows markdown instructions.

It is not a Superpowers, Copilot, or Codex API integration. It does not automatically launch,
retry, or review subagents. Coding agents can use it when the developer loads or references it.

### Agent-Assisted Artifact Maintenance (v6 — implemented)

v6 introduces agent-assisted artifact maintenance. Witness detects when `.witness/` artifacts
need maintenance, generates a strict copy-ready prompt, and validates the agent-produced changes.

**Core boundary**: LLM may draft. Witness validates. Developer approves.

Two new commands:
- `Witness: Update Project Memory with Agent` — generates a strict maintenance prompt for the
  developer's active coding agent. Opens in an unsaved markdown tab. Does not call any LLM.
  Does not write `.witness/` directly.
- `Witness: Validate Artifact Maintenance` — validates that the agent's changes stayed inside
  `.witness/` and produced the required artifact structure. Opens a validation report for developer
  review.

Five new harness contracts under `.witness/harness/` define the allowed writes, forbidden actions,
and required output sections for each maintenance kind.

What v6 does not do: call any LLM directly, manage API keys, inject prompts automatically,
modify source code, or approve artifacts without developer review.

---

## Document History

| Date | Change |
|------|--------|
| 2026-05-15 | Initial lock. Created during v3 close. Reflects v3.1–v3.6 implementation. |
| 2026-05-18 | v4 update. Added automatic activation principle. Added v4 UX principles section. Moved resolver from candidate to implemented. |
| 2026-05-18 | v4.6 update. Added Agent Harness Pack to implemented features. No UX principle changes. |
| 2026-05-18 | v4.7 update. Added Generic Orchestrator Harness Guide to implemented features. No UX principle changes. |
| 2026-05-23 | v6 update. Added v6 UX principles section. Added Agent-Assisted Artifact Maintenance to implemented features. Lock date updated to v6. |
