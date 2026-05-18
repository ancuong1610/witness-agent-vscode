# Witness Agent — OpenTelemetry Evaluation Model

This document defines the planned OpenTelemetry (OTel) instrumentation and evaluation model for
Witness Agent. OTel instrumentation is not yet implemented in v1 or v1.1. This document serves as
the specification for v2 OTel work and as the authoritative framing for how telemetry data relates
to the Witness risk model.

---

## Status

Planned. Not yet implemented.

This document is part of the v1.1 Documentation and Project Framing Lock. It defines the direction
for v2 OTel work. No spans, events, or metrics are emitted by the v1 or v1.1 extension.

---

## Why OpenTelemetry Is Required

Witness Agent's five continuity risk dimensions describe observable symptoms of context
degradation. To assess these dimensions reliably, the risk logic needs structured, timestamped
evidence — not ad hoc human estimates. OpenTelemetry provides a vendor-neutral, standardized
mechanism for collecting this evidence in a form that is:

- **Structured** — each event carries a defined set of attributes, enabling consistent querying
  and analysis.
- **Timestamped** — events carry precise timestamps, enabling duration calculations, age
  calculations, and sequence reconstruction.
- **Traceable** — spans can be nested and linked, enabling subagent boundaries and session
  hierarchies to be represented as explicit trace trees.
- **Exportable** — OTel data can be sent to any compatible backend (Jaeger, Zipkin, Prometheus,
  Grafana, vendor-specific platforms) without changes to the instrumentation.
- **Composable with risk logic** — OTel provides evidence; the Witness risk dimensions provide
  the interpretation framework. These two concerns are separated by design.

Without OTel, risk assessments in Witness Agent depend entirely on developer-supplied estimates
entered through QuickPick prompts. These estimates are valuable and intentional, but they benefit
from corroboration by automatically collected data. OTel provides that corroboration.

---

## The Relationship Between OTel Evidence and Witness Risk Logic

OTel provides evidence. Witness risk logic interprets evidence.

This separation is a design invariant. OTel spans and events are raw observations: "this command
was called at this time," "this many files were changed," "this session has been running for this
many minutes." OTel does not produce risk assessments.

The Witness risk model — the five dimensions, the five levels, the worst-wins aggregation rule —
interprets OTel evidence and produces risk assessments. The risk model is not embedded in OTel;
it runs on top of OTel.

This separation ensures that:

1. OTel data can be exported to any backend without carrying Witness-specific semantics.
2. The risk model can be updated independently of the instrumentation.
3. OTel evidence can be queried by tools that have no knowledge of the Witness risk model.
4. The risk model can incorporate non-OTel inputs (developer QuickPick estimates, ADR metadata)
   alongside OTel inputs.

---

## Planned Spans and Events

The following spans and events are planned for v2 instrumentation. Each Witness command will emit
a corresponding span or event when executed. All events use the `witness.` namespace prefix.

### Command-Level Spans

Each span covers the full execution of a Witness command, from invocation to artifact write.

| Span Name | Emitted By |
|-----------|-----------|
| `witness.project.initialized` | `Witness: Initialize Project` |
| `witness.session.started` | `Witness: Start Session` |
| `witness.context_snapshot.created` | `Witness: Record Context Snapshot` |
| `witness.workspace.observed` | `Witness: Observe Workspace` |
| `witness.adr.created` | `Witness: Create ADR` |
| `witness.subagent.report_recorded` | `Witness: Record Subagent Report` |
| `witness.risk.assessed` | `Witness: Assess Continuity Risk` |
| `witness.handover.generated` | `Witness: Generate Handover` |
| `witness.handover.validated` | `Witness: Validate Handover` |
| `witness.resume_probe.created` | `Witness: Create Resume Probe` |
| `witness.current_state.snapshot_created` | `Witness: Compress Current State` |

### Planned Span Attributes

Each span carries a common set of attributes. Additional attributes are listed per span type.

**Common attributes (all spans):**

| Attribute | Type | Description |
|-----------|------|-------------|
| `witness.session_id` | string | The active session identifier at time of command execution |
| `witness.workspace_root` | string | Hashed or relative path of the workspace root |
| `witness.extension_version` | string | Version string of the Witness Agent extension |
| `witness.command_name` | string | The VS Code command ID that emitted this span |

**`witness.context_snapshot.created` additional attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `witness.context_pressure_pct` | float | Estimated context window usage as a percentage (0.0–100.0) |
| `witness.measurement_method` | string | How the estimate was obtained (e.g., `manual`, `token_count`) |

**`witness.risk.assessed` additional attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `witness.risk.active_context_pressure` | string | Risk level for Active Context Pressure dimension |
| `witness.risk.artifact_externalization_gap` | string | Risk level for Artifact Externalization Gap dimension |
| `witness.risk.subagent_boundary_risk` | string | Risk level for Subagent Boundary Risk dimension |
| `witness.risk.quality_drift` | string | Risk level for Quality Drift dimension |
| `witness.risk.phase_boundary_risk` | string | Risk level for Phase Boundary Risk dimension |
| `witness.risk.overall_level` | string | Overall risk level (GREEN, YELLOW, ORANGE, RED, BLOCKED) |
| `witness.risk.developer_override` | boolean | Whether the developer overrode the auto-computed level |

**`witness.handover.validated` additional attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `witness.validation.passed` | boolean | Whether the handover passed all eight rule classes |
| `witness.validation.issue_count` | int | Total number of validation issues found |
| `witness.validation.handover_id` | string | Identifier of the handover that was validated |

**`witness.subagent.report_recorded` additional attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `witness.subagent.identifier` | string | Developer-supplied subagent identifier |
| `witness.subagent.model` | string | Model name selected from QuickPick |
| `witness.subagent.ordinal` | int | Sequential ordinal of this report within the session |

---

## Planned Metrics

The following metrics are candidates for v2 implementation. These are not yet defined or collected.
They are listed here to anchor the v2 instrumentation design.

| Metric Name | Type | Description |
|-------------|------|-------------|
| `session_duration_minutes` | gauge | Minutes elapsed since the current session was started |
| `changed_files_count` | gauge | Number of files changed (dirty) in the current workspace |
| `current_state_age_minutes` | gauge | Minutes since `current-state.md` was last written |
| `active_subagent_count` | counter | Total subagent reports recorded in the current session |
| `unreviewed_subagent_count` | gauge | Subagent reports where orchestrator review is not marked complete |
| `handover_validation_status` | gauge | 1 if the most recent handover passed validation, 0 otherwise |
| `resume_probe_score` | gauge | Fraction of probe questions answered correctly (0.0–1.0) |
| `risk_level_numeric` | gauge | Numeric encoding of the current overall risk level (0=GREEN, 4=BLOCKED) |

### Metric Interpretation Notes

- `current_state_age_minutes` is a primary input to the Artifact Externalization Gap dimension. A
  high value indicates that `current-state.md` may no longer reflect reality.
- `unreviewed_subagent_count` is a primary input to the Subagent Boundary Risk dimension.
- `resume_probe_score` is the most direct measure of resume quality available to the system. A
  score below 0.75 (fewer than three of four questions answered correctly) should trigger
  handover strengthening before use.
- `risk_level_numeric` allows dashboards and alerting rules to treat overall risk as a scalar
  for threshold-based triggers.

---

## OTel Backend and Export Direction

In v2, Witness Agent will support one or more OTel export targets:

- **File export** — write OTel span data as JSONL to `.witness/telemetry/` for local analysis
  without requiring a running OTel collector.
- **OTLP export** — emit spans to an OTLP endpoint (configurable via VS Code settings) for
  routing to Jaeger, Grafana Tempo, or any OTLP-compatible backend.

The file export mode is the primary target for v2 because it requires no external infrastructure.
OTLP export is an opt-in enhancement for teams with existing observability pipelines.

---

## What OTel Does Not Replace

OTel instrumentation does not replace the developer-facing QuickPick risk assessment workflow.
The QuickPick workflow captures developer judgment and qualitative observations — for example,
Quality Drift and Phase Boundary Risk — that cannot be computed from raw telemetry. OTel provides
corroborating quantitative evidence; human judgment provides the qualitative interpretation.

The v2 risk model will combine both sources. When OTel data is available, it will be used to
pre-populate or validate the QuickPick estimates. When it is not available (e.g., in a workspace
where OTel has not yet been configured), the QuickPick workflow remains the sole input.

---

## Document Status

This document is part of the v1.1 Documentation and Project Framing Lock. It is the authoritative
specification for v2 OTel instrumentation. No implementation work should begin until this document
has been reviewed against the v2 scope.
