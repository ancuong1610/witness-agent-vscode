# Witness Agent — Coding Agent Entry Point

This project uses Witness Agent for session continuity. Witness maintains a `.witness/` directory
that records session state, handovers, subagent ledger entries, architectural decisions, context
pressure measurements, and risk assessments.

---

## Default Read Set

Before starting any work, read these three files in order:

1. `.witness/index.md` — project identity, goals, and artifact map
2. `.witness/current-state.md` — current implementation state and open questions
3. `.witness/handovers/latest.md` — last completed session handover

If the developer has provided a reviewed context packet
(`.witness/sessions/<session-id>-context-packet-NNN.md`), use it as the primary resume artifact
instead of or alongside the three default files. Do not use an unreviewed packet.

---

## What Not to Load by Default

Do not scan all `.witness/` files by default. The full directory contains telemetry, session
histories, evaluation summaries, and subagent evidence that are not needed for normal coding.

Do not read raw telemetry files (`.witness/telemetry/`) unless explicitly asked.

Pull ADR files (`.witness/decisions/`), subagent ledger entries (`.witness/subagents/`), and
evaluation summaries (`.witness/evaluation/`) only when the task specifically requires them.

---

## Before Editing

Before making any code edits, summarize the following from the read set:

1. Current project goal — what the project is trying to accomplish in this session.
2. Current project state — what has been implemented, what is working, what is known-broken.
3. Relevant risks or open issues — any red/blocked risk level, blocked subagent, or stale handover.
4. Next safe step — the single most appropriate action to take first.
5. Artifacts that need inspection — any file explicitly referenced in the handover or context
   packet as requiring review before work proceeds.

Do not proceed to editing if any mandatory markers (`[MANDATORY]`, `<!-- MANDATORY -->`) remain
unresolved in a loaded context packet.

---

## Subagent Protocol

If you are acting as a subagent delegated a bounded task by a primary agent or developer:

- Read `contract.md` first. The contract defines your task scope, acceptance criteria, and
  out-of-scope boundaries. Do not exceed that scope.
- Read `context-packet.md` if present. It contains the context selected for your task.
- Follow the full protocol in `.witness/harness/subagent-task.md`.
- Do not self-review. Do not mark your own work as accepted.
- Do not write to `.witness/` files outside your ledger entry directory.

---

## When Witness Status Is Non-Clear

If the developer reports or you observe that the Witness status bar shows `Review Needed`,
`Risk Critical`, `Subagent Blocked`, or `Stale Artifacts`:

- Do not continue implementation blindly.
- Inspect the relevant artifact (blocked subagent directory, handover, risk assessment).
- Follow the protocol in `.witness/harness/continuity-issue.md`.
- If you cannot resolve the issue, ask the developer to run `Witness: Resolve Continuity Issue`
  or `Witness: Show Workspace Status`.

---

## Constraints

These constraints are non-negotiable. Do not cross them even if asked.

- Do not mark subagent work as reviewed or accepted. Only the developer or primary agent who
  delegated the task may accept subagent output.
- Do not rewrite `.witness/current-state.md` without developer review and confirmation.
- Do not infer missing architectural decisions. If a decision is not recorded in an ADR, ask.
- Do not generate or modify handovers autonomously. Handovers are produced by the developer
  running `Witness: Generate Handover` and validated with `Witness: Validate Handover`.
- Do not switch sessions without developer initiation.

---

## Harness Files

Detailed protocols are available in `.witness/harness/`:

| File | Purpose |
|------|---------|
| `agent-resume.md` | Protocol for joining or resuming a project |
| `subagent-task.md` | Protocol for agents acting as subagents |
| `continuity-issue.md` | Protocol when Witness reports a non-clear status |
| `session-switch.md` | Protocol for preparing or resuming across session boundaries |
| `orchestrator.md` | Protocol for orchestrator-style workflows that delegate work to subagents |

Load the relevant file when the task matches its scope.

For orchestrator-style coding workflows that delegate work to subagents, also read
`.witness/harness/orchestrator.md`. It defines when to use no ledger, a lightweight ledger, or
a full ledger, and provides delegation, failure, and context minimization policies.

---

## Note on Automation

These files are agent-readable instructions. Coding agents can use them when the developer
loads or references them. They are not automatically injected into any agent context. Witness
Agent does not integrate directly with any coding agent API or chat participant.
