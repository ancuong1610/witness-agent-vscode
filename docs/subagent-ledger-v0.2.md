# Witness Agent — Subagent Ledger v0.2

This document defines the v0.2 Subagent Ledger direction for Witness Agent. It explains the
limitation of the v1 subagent model, defines the five-stage ledger that will replace it in v0.2,
and explains why traceable subagent evidence is essential for orchestrator reliability.

---

## Status

Planned. Not yet implemented.

This document is part of the v1.1 Documentation and Project Framing Lock. The v0.2 Subagent
Ledger is a v2-track feature. No ledger artifacts are created by the v1 extension.

---

## The Limitation of v1 Subagent Recording

In v1, Witness Agent records subagent activity via the `Witness: Record Subagent Report` command.
This command creates a structured report file in `.witness/subagents/` with sequential numbering.
The report captures the subagent identifier, model, task summary, outputs, decisions, and a notes
field.

This is a meaningful improvement over no recording at all. However, the v1 model has a significant
structural limitation: it records completion reports, not the full subagent lifecycle.

The failure mode this creates:

- The orchestrator dispatches a subagent with a task goal and some context.
- The subagent completes the task and returns a result.
- The developer records a completion report.

What is not captured:

- What context was given to the subagent at dispatch? Was it sufficient? Was it correct?
- What was the explicit acceptance criteria for the subagent's work?
- What evidence did the subagent produce — beyond the final output — that the work was done
  correctly?
- Did the orchestrator review and accept the subagent output, or was it assumed correct?

Without answers to these questions, the subagent completion report is a claim, not evidence. The
orchestrator cannot verify the claim, and a subsequent session cannot trust it.

---

## The Subagent Boundary Problem

Subagents are ephemeral by design. Each subagent invocation creates a new context window with its
own knowledge state. When the subagent completes:

- Its working context is lost.
- Its reasoning is not visible to the orchestrator.
- Its decisions are not automatically integrated into the parent session.
- Its evidence is only as reliable as what the orchestrator chooses to record.

This is the subagent boundary problem. It is analogous to the session boundary problem that Witness
Agent exists to solve for primary sessions — but it occurs at a finer granularity and with less
ceremony, making it easier to overlook.

A well-designed orchestrator workflow treats every subagent boundary as a potential continuity
risk. The Subagent Boundary Risk dimension in the Witness risk model exists specifically to surface
this risk.

---

## The v0.2 Subagent Ledger Model

The v0.2 Subagent Ledger replaces the single completion report with a five-stage lifecycle model.
Each stage produces a distinct artifact. Together, the five artifacts constitute a full subagent
ledger entry.

### Stage 1: Subagent Task Contract

**Created by:** Orchestrator, before dispatching the subagent.

**Purpose:** Define the subagent's task in a form that is precise enough to verify completion.

**Contents:**

- Task identifier and ordinal
- Task goal: a precise, verifiable statement of what the subagent must accomplish
- Acceptance criteria: explicit conditions that must be true for the task to be considered complete
- Scope constraints: what the subagent is and is not permitted to do or modify
- Context summary: the minimum context the subagent needs to execute the task
- Expected evidence: what artifacts or observations the subagent must produce as proof of completion

The task contract is the specification against which the completion report and orchestrator review
are evaluated. A subagent task without a contract is unverifiable.

### Stage 2: Subagent Context Packet

**Created by:** Orchestrator, at dispatch time (may be combined with Stage 1).

**Purpose:** Record exactly what context was given to the subagent at the moment of dispatch.

**Contents:**

- Snapshot of the relevant sections of `current-state.md` at dispatch time
- List of files the subagent was given access to or was expected to read
- List of relevant ADRs referenced in the context
- Any handover fragments or partial state transferred to the subagent
- Token estimate for the context packet (if available)

The context packet serves two purposes. First, it enables post-hoc analysis of whether the
subagent received sufficient and correct context for its task. Second, it establishes a baseline
against which the subagent's outputs can be evaluated for consistency.

Context packets reduce unnecessary context loading: because the packet is recorded, the orchestrator
does not need to reload the full session history to understand what the subagent knew. The packet
is the authoritative record of subagent context.

### Stage 3: Subagent Process and Evidence Summary

**Created by:** Subagent or orchestrator, after subagent completion and before final review.

**Purpose:** Capture what the subagent actually did, beyond the final output.

**Contents:**

- Files modified, created, or deleted by the subagent
- Commands or shell operations executed (if applicable)
- Intermediate decisions made during execution
- Deviations from the task contract, with rationale
- Test results, validation output, or other observable verification evidence
- Any assumptions the subagent made that were not covered by the task contract

The process summary is the evidence layer. It is distinct from the completion report (which states
the result) and from the task contract (which states the requirement). It answers the question:
what actually happened during subagent execution?

### Stage 4: Subagent Completion Report

**Created by:** Subagent or developer, after subagent completion.

**Purpose:** State the result of the subagent task in relation to the acceptance criteria.

**Contents:**

- Summary of outputs delivered
- Acceptance criteria status: each criterion from the task contract marked as met, partially met,
  or not met, with evidence references
- Decisions made that have implications for the parent session or for future sessions
- Known gaps or limitations in the subagent's output
- Recommended follow-up actions for the orchestrator

The v1 subagent report is essentially a simplified version of this stage. In v0.2, the completion
report is more structured and is explicitly linked to the task contract and evidence summary.

### Stage 5: Orchestrator Review

**Created by:** Orchestrator (developer or primary agent), after reviewing Stages 1–4.

**Purpose:** Record the orchestrator's acceptance or rejection of the subagent's work, and
integrate verified decisions into the parent session record.

**Contents:**

- Review date and session context at time of review
- Acceptance decision: accepted, accepted with conditions, or rejected
- Conditions or remediation required (if applicable)
- Integration actions taken: which decisions from the subagent were promoted to ADRs, which
  changes were accepted into `current-state.md`, which observations were recorded in the session
- Residual risk: any known risks introduced by the subagent's work that have not been fully
  resolved

The orchestrator review closes the ledger entry. Without an orchestrator review, the subagent
completion report remains an open, unverified claim. The review is the formal acceptance step that
makes subagent work trustworthy.

---

## Why the Full Ledger Matters

### Transparency

A developer reviewing `.witness/subagents/` six weeks later should be able to reconstruct exactly
what each subagent was asked to do, what context it had, what it did, and whether its work was
accepted. The v1 completion report provides a partial picture. The full v0.2 ledger provides the
complete picture.

### Control

The task contract (Stage 1) makes the acceptance criteria explicit before the subagent runs. This
prevents the common failure mode where a subagent delivers a plausible but incorrect result that
the orchestrator accepts because the criteria were never stated precisely.

### Tracing

The context packet (Stage 2) and evidence summary (Stage 3) create an auditable trail of what the
subagent knew and what it did. This trail is the basis for two important capabilities: root cause
analysis when subagent output is found to be incorrect, and context packet reuse for similar future
tasks where the same subagent configuration might apply.

### Subagent Boundary Risk Reduction

The orchestrator review (Stage 5) is the integration step that Witness Agent's Subagent Boundary
Risk dimension is designed to prompt. When an orchestrator review exists for every subagent in a
session, the Subagent Boundary Risk dimension can be assessed as low. When reviews are missing,
boundary risk is elevated regardless of the quality of the individual completion reports.

---

## Artifact Naming Convention (Planned)

In v0.2, each subagent ledger entry will consist of five files named with a common subagent
identifier and stage suffix:

```
.witness/subagents/
├── subagent-001-contract.md
├── subagent-001-context-packet.md
├── subagent-001-evidence.md
├── subagent-001-completion.md
└── subagent-001-review.md
```

A new Witness command, `Witness: Open Subagent Ledger` (planned), will provide a structured
interface for creating and navigating ledger entries.

---

## Relation to the Current v1 Workflow

In v1, `Witness: Record Subagent Report` creates a single file: `subagent-001.md`. This file
corresponds roughly to a simplified Stage 4 (completion report). It will remain compatible with
the v0.2 model: existing completion reports will be treated as Stage 4 entries without corresponding
Stage 1–3 entries, with Subagent Boundary Risk elevated accordingly.

Teams adopting v0.2 can migrate incrementally by adding the missing stages to existing entries or
by applying the full five-stage model to new subagent invocations only.

---

## Document Status

This document is part of the v1.1 Documentation and Project Framing Lock. It is the authoritative
specification for the v0.2 Subagent Ledger. Implementation planning should not begin until this
document has been reviewed against the v2 scope and the OTel evaluation model.
