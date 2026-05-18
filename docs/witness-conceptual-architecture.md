# Witness Agent — Conceptual Architecture of `.witness/`

This document explains the three conceptual layers inside `.witness/`, how they relate to each
other, what a coding agent should read at session start, and why the separation of concerns between
layers is essential to the reliability of the continuity system.

---

## Overview

The `.witness/` directory is not a flat archive of documents. It is organized into three
conceptual layers, each with a distinct purpose and a distinct audience. Understanding the boundary
between these layers is essential for both implementing Witness Agent features and for designing
agent workflows that use `.witness/` correctly.

```
.witness/
├── [Continuity Source-of-Truth Layer]
│   ├── index.md
│   ├── current-state.md
│   ├── constitution.md
│   ├── commands.md
│   ├── decisions/
│   ├── sessions/
│   ├── handovers/
│   ├── evaluation/
│   └── templates/
│
├── [Telemetry and Evaluation Layer]
│   └── telemetry/
│
└── [Workflow Harness Layer — currently distributed]
    ├── commands.md
    └── templates/
```

---

## Layer 1: Continuity Source-of-Truth Layer

### Purpose

This layer gives the coding agent the minimum reliable project context needed to resume work at the
start of a fresh session. It is the primary target of the default fresh-session read protocol. Its
artifacts are designed to be:

- **Selective** — not exhaustive. The agent loads what it needs, not everything.
- **Compressed** — current-state and handover documents are intentionally concise so that they
  consume minimal context window space.
- **Current** — these documents must reflect the actual state of the project. Stale source-of-truth
  is a primary continuity risk.
- **Validated** — handovers in this layer must pass the eight-rule validation protocol before use.

### Contents

| Path | Role |
|------|------|
| `.witness/index.md` | Directory map, reading order guide, and pointer to `latest.md` |
| `.witness/current-state.md` | The living single source of truth for project state |
| `.witness/constitution.md` | Continuity rules, risk vocabulary, and behavioral contracts for agents |
| `.witness/commands.md` | Command palette cheat sheet (optional in fresh-session read set) |
| `.witness/decisions/` | Architectural Decision Records (ADRs) — reference, not front-loaded |
| `.witness/sessions/` | Per-session records — reference, not front-loaded |
| `.witness/handovers/` | Validated handover documents, including `latest.md` |
| `.witness/evaluation/` | Validation reports and resume probes — reference, not front-loaded |
| `.witness/templates/` | Blank templates for runtime use by Witness commands |

### Default Fresh-Session Read Set

When a fresh coding agent session starts, it should load exactly these files:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

This three-file set provides the minimum reliable context. It is sufficient for a competent agent
to resume work on a well-maintained project.

Additional files from this layer — ADRs, subagent reports, session observations — should be loaded
on demand as specific questions arise, not front-loaded at session start. Front-loading increases
context pressure without corresponding benefit for most tasks.

`constitution.md` is recommended at session start for agents that are new to the project or that
will be making decisions with continuity implications. It is optional for routine continuation tasks
where the agent is already familiar with the risk vocabulary and behavioral contracts.

### What Agents Should Not Read from This Layer by Default

- `sessions/` — session records are reference material. They are dense and often stale relative to
  the handover. Load specific session files only when investigating a particular decision or event.
- `decisions/` — ADRs are reference material. Load only the ADRs linked from the handover as
  relevant to the next step.
- `evaluation/` — validation reports and resume probes are meta-artifacts. They describe the
  quality of handovers, not the current state of the project. Do not load these at session start.
- `templates/` — templates are for Witness command runtime use, not for agent context loading.

---

## Layer 2: Telemetry and Evaluation Layer

### Purpose

This layer collects data for context management, tracing, subagent behavior monitoring, and
observable symptoms of context degradation. It is the evidence layer — it records what happened,
not what the project state currently is.

### Contents

| Path | Role |
|------|------|
| `.witness/telemetry/` | Context pressure snapshots, evaluation data, and (planned) OTel event records |

### Implementation Status

In v1, the `telemetry/` directory is created by `Witness: Initialize Project` and is available as
a write target. Formal OpenTelemetry instrumentation is planned for v2. When OTel is implemented,
Witness commands will emit structured spans and events that are recorded here for later analysis.

See `docs/otel-evaluation-model.md` for the planned OTel instrumentation model.

### Why This Layer Must Stay Separated from the Source-of-Truth Layer

The separation between the telemetry layer and the source-of-truth layer is a design invariant,
not a convenience. The reasons are:

1. **Read set contamination.** If telemetry data is mixed into the source-of-truth directories,
   there is a risk that agents load raw measurement data as context. Raw telemetry is dense,
   numerical, and provides no direct benefit to an agent resuming work. It wastes context window
   space and may confuse agents that interpret it as project state.

2. **Staleness semantics differ.** Source-of-truth documents must be current. Telemetry data is
   expected to be historical — it accumulates over time and is never "updated" in the same way
   that `current-state.md` is updated. Mixing the two creates ambiguity about which documents
   should be trusted as current.

3. **Audience differs.** Source-of-truth documents are read by coding agents resuming work.
   Telemetry data is processed by the Witness risk logic, by developers reviewing continuity
   health, and (planned) by OTel-compatible observability backends. These are different consumers
   with different needs.

4. **Future tooling.** When OTel exporters and dashboards are added in v2, the telemetry layer
   needs to be addressable as a clean, isolated data source. Mixing it with handovers and session
   records would make this integration fragile.

### What Agents Should Not Read from This Layer

Agents resuming work should not read `.witness/telemetry/` by default. Telemetry data is not part
of the default fresh-session read set. It is not part of the optional read set either, except in
specific diagnostic workflows where a developer is investigating context pressure history.

---

## Layer 3: Workflow Harness Layer

### Purpose

This layer provides commands, templates, prompts, checklists, and workflow guidance for coding
agents and developers. It is the operational layer — the tooling and scaffolding that makes the
continuity workflow executable.

### Current v1 Representation

In v1, the workflow harness is distributed across two locations:

| Path | Role |
|------|------|
| `.witness/commands.md` | Command palette cheat sheet: what each Witness command does and when to use it |
| `.witness/templates/` | Blank templates for sessions, ADRs, handovers, and more |

These are the current harness artifacts. `commands.md` provides agent-facing workflow guidance.
The templates in `templates/` are the scaffolding used by Witness commands when creating new
artifacts.

### Planned v2 Direction

In v2, the workflow harness is planned to expand into a dedicated `.witness/harness/` directory
containing:

- Structured workflow checklists for each phase transition.
- Resume prompts: pre-written prompts for loading a fresh session with the correct context.
- Subagent contracts: templates for specifying subagent tasks, expected evidence, and acceptance
  criteria.
- Minimal context packet templates: structured formats for assembling the minimum reliable context
  packet for a given task type.
- Agent behavioral prompts: guidance for how coding agents should interact with `.witness/`
  artifacts during a session.

### What Agents Should Read from This Layer

Coding agents resuming work should optionally read `.witness/commands.md` for orientation. It is
lightweight and provides a reliable summary of what Witness Agent can do and when each command
should be invoked. This is particularly useful for agents that will be managing the Witness
workflow on behalf of the developer.

Templates in `.witness/templates/` are not for agent reading — they are blank scaffolding files
used by Witness commands to create new artifacts.

---

## How the Three Layers Relate

The three layers are distinct in purpose but interdependent in operation:

```
Workflow Harness Layer
    (commands, templates, prompts)
         |
         | invoked by developer / agent
         v
Continuity Source-of-Truth Layer          Telemetry and Evaluation Layer
    (index, current-state, handovers)  <---  (telemetry/, context pressure data)
         |                                            |
         | read by fresh session                      | processed by risk logic
         v                                            v
    Coding Agent resumes work             Risk assessment and continuity signals
```

The workflow harness drives artifact creation. Each Witness command creates or updates documents in
the source-of-truth layer. In parallel, observable data (context pressure, artifact gaps, subagent
counts) flows into the telemetry layer. The Witness risk logic draws on both layers to produce risk
assessments and handover validation results.

---

## Core Principle: Store Broadly, Compress Carefully, Load Minimally

The design of `.witness/` follows a three-part principle:

**Store broadly.** Record all meaningful session artifacts: decisions, subagent reports, workspace
observations, context pressure measurements. It is better to have more than is needed than to
discover, at the start of a fresh session, that a critical decision was never recorded.

**Compress carefully.** `current-state.md` and handover documents must be compressed and current.
They are loaded into the context window at session start. Every token they consume is a token that
cannot be used for actual work. The Witness commands `Compress Current State` and `Generate
Handover` are designed to support this compression discipline.

**Load minimally.** The default fresh-session read set is exactly three files. Additional context
is loaded on demand. This discipline preserves context window space for actual work and reduces the
risk that stale or irrelevant context contaminates the session.

These three principles define the relationship between the three layers: store broadly into the
source-of-truth and telemetry layers; compress carefully when updating the primary resumption
artifacts; load minimally when starting a fresh session.

---

## Why This Supports Minimal Reliable Context

A fresh coding agent session has a limited context window. If that window is consumed by exhaustive
documentation loading, there is little space left for the actual work of the session. Worse,
loading stale or loosely related documents increases the risk of the agent drawing incorrect
inferences about the current project state.

The three-layer architecture supports minimal reliable context by:

1. Providing a single, authoritative resumption artifact (`handovers/latest.md`) that aggregates
   the most important context from the previous session.
2. Separating reference material (ADRs, session records) from resumption material (handover,
   current-state) so that agents can make a principled decision about what to load.
3. Isolating telemetry data so it is never accidentally loaded as project context.
4. Providing a workflow harness that makes the correct context-loading behavior the path of least
   resistance for both developers and agents.

---

## Document Status

This document is part of the v1.1 Documentation and Project Framing Lock. It defines the
conceptual architecture for all subsequent `.witness/` development.
