# Witness Agent — Locked Product Scope

This document defines the locked scope for Witness Agent. It is the authoritative reference for
what the product is, what it is not, and what boundaries govern its development. All future feature
decisions should be evaluated against this document before acceptance.

---

## Product Identity

Witness Agent is a VS Code extension that creates and maintains a repo-local `.witness/` continuity
system for AI-assisted coding workflows.

Its three core responsibilities are:

1. **Transparency** — make project state, decisions, subagent boundaries, and risk signals
   visible and persistent, not buried in ephemeral chat sessions.

2. **Control** — give developers explicit, intentional checkpoints at which to externalize context,
   assess continuity risk, generate handovers, and validate resume quality. Nothing is automatic.

3. **Tracing** — record enough structured evidence that an orchestrator or developer can reconstruct
   what happened in a session, which subagents were used, what decisions were made, and whether the
   handover is safe to use.

---

## Target Workflow

Witness Agent is designed for the workflow in which a developer uses VS Code alongside one or more
AI coding agents (GitHub Copilot, Claude Code, or similar). In this workflow:

- Sessions are ephemeral. When a session ends, the agent loses all working context.
- Decisions are made inside chat. They are not automatically persisted.
- Subagents are dispatched. Their work is often poorly integrated into the parent session record.
- Sessions end without a structured handover. The next session re-discovers context by trial and
  error.

Witness Agent addresses each of these failure modes by providing a structured command palette
interface for externalizing session artifacts into `.witness/` before a session ends, and a defined
read protocol for loading the minimum reliable context when a fresh session begins.

---

## The Role of `.witness/`

`.witness/` is a repo-local directory that serves as the persistent, structured external memory
for AI coding sessions. It contains:

- The minimum reliable read set a fresh session needs to resume safely.
- A structured archive of decisions, subagent reports, session records, and handovers.
- Evaluation artifacts: validation reports and resume probes.
- Telemetry data for context pressure and observable symptoms of context degradation.
- Templates and workflow guidance for agents and developers.

`.witness/` is version-controlled. Its history is auditable. Its artifacts are designed to be
loaded selectively — not exhaustively — by a fresh coding agent session.

---

## In Scope

The following capabilities are in scope for Witness Agent:

- Creating and maintaining the `.witness/` directory structure.
- Writing structured artifacts for sessions, ADRs, subagent reports, handovers, and resume probes.
- Assessing continuity risk across five locked dimensions.
- Generating and validating handover documents.
- Measuring and recording context pressure.
- Observing git state and workspace artifacts.
- Compressing and archiving `current-state.md`.
- (Planned) Emitting OpenTelemetry spans and events from each Witness command.
- (Planned) Modeling the full subagent lifecycle via the Subagent Ledger.
- (Planned) Assembling minimal context packets for validated session resumption.

---

## Out of Scope

The following capabilities are explicitly out of scope for Witness Agent:

- Generating code. Witness Agent is not a coding agent.
- Replacing GitHub Copilot, Claude Code, Codex, or any coding agent. Witness Agent runs beside
  these tools; it does not substitute for them.
- Intercepting, modifying, or communicating with AI agent backends at runtime.
- Automatically switching sessions. Session boundaries are developer-controlled.
- Automatically loading context into a coding agent. The developer controls what the agent reads.
- Directly detecting context rot or model memory loss. Witness Agent can observe and record
  observable symptoms of context degradation; it cannot diagnose model internals.
- Raw memory dumps or raw chat log ingestion.
- Publishing or syncing `.witness/` to any external service.
- Multi-user collaboration features (beyond standard git).

---

## Relation to Coding Agents

Witness Agent has no API connection to any coding agent at runtime. The relationship between
Witness Agent and a coding agent (Copilot, Claude Code, etc.) is entirely mediated by the
filesystem:

- Witness Agent writes structured artifacts to `.witness/`.
- The developer loads selected `.witness/` files into the coding agent's context window at the
  start of a fresh session.
- The coding agent reads those files and uses them to resume work.

There is no plugin, extension, or protocol between Witness Agent and any coding agent. Witness
Agent is a parallel VS Code extension that runs in the same workspace but communicates only through
files.

---

## Relation to Superpowers-Inspired Subagent Workflows

Witness Agent's subagent model is influenced by the concept of structured subagent dispatch and
evidence collection, as seen in workflows inspired by the Superpowers pattern. In this pattern,
an orchestrator dispatches subagents for specific tasks and expects traceable evidence — not just
a result — when each subagent completes.

Witness Agent v1 records subagent completion reports. It does not yet model the full subagent
lifecycle: task contracts, context packets, evidence summaries, and orchestrator review stages are
planned for the v0.2 Subagent Ledger (see `docs/subagent-ledger-v0.2.md`).

The core principle: subagents are ephemeral. If their work is not recorded in `.witness/subagents/`
with sufficient evidence, the orchestrator cannot verify it and the parent session cannot trust it.

---

## Relation to Spec Kit-Inspired Artifact Structure

The structure of `.witness/` artifacts — particularly ADRs, handovers, and resume probes — is
influenced by the Spec Kit concept: a structured, versioned set of documents that define project
scope, constraints, and decisions in a form that can be reliably loaded into a fresh session.

Witness Agent does not implement a full Spec Kit. It provides a compatible artifact structure:
`current-state.md` as the living state document, `decisions/` as the ADR archive, and
`handovers/latest.md` as the primary resume artifact. These three, combined with `constitution.md`,
form the default fresh-session read set.

---

## Context Degradation Framing

Witness Agent does not claim to directly detect context rot or diagnose model memory loss. These
are internal model states that are not observable from outside the model.

Instead, Witness Agent observes and records the following, which are legitimate external signals of
potential context degradation:

- **Continuity risk** — the aggregate risk posture across five dimensions.
- **Context pressure** — an estimate of how full the current context window is.
- **Artifact externalization gap** — how much session state has not been persisted.
- **Subagent boundary risk** — whether subagent boundaries are documented and integrated.
- **Quality drift** — observable symptoms such as repeated corrections and contradictions.
- **Phase boundary risk** — proximity to natural handoff points.
- **Resume quality** — whether a fresh session can answer probe questions correctly using only
  the handover and default read set.
- **Handover safety** — whether the handover passes all validation rule classes.

These are observable symptoms, not a direct diagnosis. The distinction matters: Witness Agent
surfaces evidence and risk signals; the developer and orchestrator interpret them.

---

## Locked Risk Dimensions

The five continuity risk dimensions are locked. They must be used with exactly these names in all
code, documentation, templates, and user-facing text:

1. Active Context Pressure
2. Artifact Externalization Gap
3. Subagent Boundary Risk
4. Quality Drift
5. Phase Boundary Risk

## Locked Risk Levels

The five risk levels are locked. They must be used with exactly these names:

GREEN, YELLOW, ORANGE, RED, BLOCKED

---

## Document Status

This document is part of the v1.1 Documentation and Project Framing Lock. It is authoritative
for all subsequent development decisions. Changes to this document require explicit product
direction review.
