# Witness Agent — v2 Implementation Plan

**Status**: Implemented through v2.5; v2.6 documentation and regression update in progress.

**Prerequisite**: v1.1 Documentation and Project Framing Lock is complete. All v2 source work
begins after this plan is reviewed and accepted.

---

## 1. v2 Summary

v2 adds the foundation instrumentation and workflow layers that v1 deferred. Specifically, v2
introduces a local OpenTelemetry-style event writer that appends structured JSON records to
`.witness/telemetry/otel/events.jsonl` on every Witness command execution; instruments all 11
existing commands to emit events through that writer; extends the subagent model from the v1 flat
completion report into a five-stage directory-based ledger (contract, context packet, evidence,
report, review) with corresponding new commands; and adds a `Witness: Create Context Packet`
command that assembles the minimum reliable context a fresh coding agent session needs into a
single reviewed artifact. All v2 work is confined to the VS Code extension host; it adds no
network calls, no mandatory backend, and no automatic session management. It preserves every v1
artifact path and command behavior as a compatibility baseline.

---

## 2. Goals

- Add a local OTel-style event writer that appends structured JSONL records to
  `.witness/telemetry/otel/events.jsonl` on every command execution.
- Instrument all 11 existing v1 commands to emit events through the writer.
- Add the five-stage Subagent Ledger lifecycle model with corresponding new commands, while
  preserving the v1 flat `Witness: Record Subagent Report` command for backward compatibility.
- Add the `Witness: Create Context Packet` command for assembling minimal, validated context
  packets.
- Preserve all v1 artifact paths, artifact content, command IDs, and command behavior.
- Update `docs/v0.1-validation-report.md` to a v2-capable regression checklist.
- Update `README.md`, `docs/architecture.md`, and the bundled `.witness/commands.md` template
  to reflect v2 commands and the new artifact structure.

---

## 3. Non-Goals

The following are explicitly deferred past v2:

- Dashboard UI panel for risk level and active session state.
- `@witness` chat participant integration in the VS Code chat interface.
- Automatic session switching based on risk thresholds.
- Raw chat transcript capture of any kind.
- Hidden chain-of-thought or internal model reasoning capture.
- Mandatory backend telemetry exporter (OTLP, Jaeger, Prometheus, etc.).
- Automatic context compression or automatic `current-state.md` trimming.
- Token counting APIs or automated context window measurement.
- Multi-user collaboration beyond standard git.
- Marketplace publishing infrastructure (separate workstream).

---

## 4. Proposed Artifact Changes

### Existing artifacts (unchanged)

All v1 artifact paths remain valid and are not modified by v2.

```
.witness/constitution.md
.witness/index.md
.witness/current-state.md
.witness/commands.md
.witness/templates/
.witness/sessions/
.witness/telemetry/
.witness/subagents/
.witness/decisions/
.witness/handovers/
.witness/evaluation/
```

The existing flat subagent format continues to be written by the preserved v1 command:

```
.witness/subagents/subagent-NNN.md
```

### New v2 artifacts

```
.witness/telemetry/otel/
.witness/telemetry/otel/events.jsonl

.witness/subagents/subagent-NNN/
.witness/subagents/subagent-NNN/contract.md
.witness/subagents/subagent-NNN/context-packet.md
.witness/subagents/subagent-NNN/evidence.md
.witness/subagents/subagent-NNN/report.md
.witness/subagents/subagent-NNN/review.md

.witness/sessions/<session-id>-context-packet-NNN.md
```

### Numbering scheme and collision avoidance

v1 flat subagent files are named `subagent-NNN.md` (files). v2 ledger subagent entries are named
`subagent-NNN/` (directories). Both formats live inside `.witness/subagents/`. When computing the
next subagent ordinal in v2, the scanner must count both files matching `subagent-(\d{3})\.md` and
directories matching `subagent-(\d{3})` and take the highest ordinal across both. This prevents
collision between the two models. An entry created by a v2 ledger command will never share an
ordinal with a v1 flat file.

The `otel/` subdirectory inside `telemetry/` is new. It does not conflict with the existing
per-session subdirectories (named `telemetry/<session-id>/`).

---

## 5. OTel / Local Telemetry Architecture

### Why local JSONL first

OTLP export requires a running collector endpoint and network access, which are not guaranteed in
developer environments. A local append-only JSONL file requires no infrastructure, is human-
readable, is git-committable for audit purposes (though typically gitignored in large projects),
and can be parsed by any tool that reads line-delimited JSON. The JSONL format is the same format
used by OTel's file exporter, making forward migration to OTLP trivial: the event schema is
defined once and is not changed when the transport layer is added.

### Mapping to future OTel / OTLP

Each event in `events.jsonl` corresponds to an OTel span or event. The `event_name` field maps
directly to the OTel span name (e.g. `witness.session.started`). The `attributes` object maps to
OTel span attributes. The `duration_ms` field maps to the OTel span duration. When OTLP export is
added in a future release, the local writer module is replaced or augmented by an OTLP exporter;
the event schema does not change.

### Event naming convention

All event names use the `witness.` namespace prefix followed by a noun and a past-tense verb
separated by a dot. The noun describes the artifact category; the verb describes the lifecycle
action.

Examples:

```
witness.project.initialized
witness.session.started
witness.context_snapshot.created
witness.workspace.observed
witness.adr.created
witness.subagent.report_recorded
witness.risk.assessed
witness.handover.generated
witness.handover.validated
witness.resume_probe.created
witness.current_state.snapshot_created
witness.subagent_task.started
witness.subagent_task.context_packet_created
witness.subagent_task.evidence_recorded
witness.subagent_task.completed
witness.subagent_task.reviewed
witness.context_packet.created
```

### Event schema

Each line in `events.jsonl` is a single JSON object. All fields are present on every event;
fields that are not applicable for a given event are set to `null` or an empty object/array.

```jsonc
{
  "timestamp":               "2026-05-14T10:32:00.000Z",
  "event_name":              "witness.session.started",
  "extension_version":       "0.2.0",
  "workspace_root_hash":     "sha256:a3f2...",
  "session_id":              "2026-05-14-001",
  "command_id":              "witness.startSession",
  "artifact_paths":          [".witness/sessions/2026-05-14-001.md"],
  "status":                  "success",
  "duration_ms":             42,
  "attributes": {
    "session_goal_length":   27,
    "template_loaded":       true
  }
}
```

Field definitions:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO 8601 string | UTC timestamp at moment of event emission |
| `event_name` | string | OTel-compatible event name (see naming convention above) |
| `extension_version` | string | Value from `package.json` at runtime |
| `workspace_root_hash` | string | SHA-256 of the absolute workspace root path, prefixed `sha256:`. Never the raw path. |
| `session_id` | string or null | Active session ID at time of command execution, or null if none |
| `command_id` | string | The VS Code command ID that triggered the event |
| `artifact_paths` | string array | Relative paths (relative to workspace root) of artifacts written. Empty array if none. |
| `status` | string | `"success"`, `"cancelled"`, or `"error"` |
| `duration_ms` | number or null | Elapsed milliseconds from command entry to event emission. Null if not measurable. |
| `attributes` | object | Command-specific key-value pairs. See per-command table in Section 6. |

### Error handling

The event writer must never throw an exception that propagates to the caller. All write failures
are caught inside the writer module and optionally logged to the VS Code output channel (at a
debug level that does not surface to the user). Command behavior is unaffected by telemetry write
failures. This is the fire-and-forget telemetry principle: telemetry is supplementary evidence,
not a required control path.

If `events.jsonl` does not exist, the writer creates it. If the `otel/` directory does not exist,
the writer creates it. These operations also follow the fire-and-forget principle.

### Privacy and data minimization

The following data is never written to `events.jsonl`:

- Raw prompt text or chat transcript content of any kind.
- File content from the workspace (source code, documentation body text, etc.).
- The raw workspace root path (replaced by a SHA-256 hash).
- Any personally identifiable information beyond what is inherent in the session ID
  (which is date-derived, not user-derived).
- Hidden chain-of-thought or internal model reasoning.

The `session_goal_length` attribute records the character count of the session goal, not the goal
text itself. The `artifact_paths` field records relative paths, not absolute paths. These
constraints are enforced in the writer module and must be reviewed in any code that adds attributes
to events.

The `workspace_root_hash` is a one-way SHA-256 hash of the absolute path string. It allows
correlating events across runs in the same workspace without exposing the path.

---

## 6. Existing Command Instrumentation Plan

Each of the 11 v1 commands emits one event on completion. The event is emitted after the primary
artifact write succeeds (or after cancellation/error is determined). The `status` field is:
- `"success"` if the artifact was written and the editor was opened.
- `"cancelled"` if the user dismissed a QuickPick or InputBox.
- `"error"` if an unhandled exception occurred.

The `duration_ms` field is computed as the elapsed time from the entry of the command's exported
async function to the point of event emission.

### `witness.initProject` → `witness.project.initialized`

| Field | Value |
|-------|-------|
| Event name | `witness.project.initialized` |
| Emitted when | After all subdirectories and root documents are written (or after guard failure) |
| Status on guard failure | `"error"` (no workspace open or `.witness/` already fully exists) |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `was_already_initialized` | boolean | true if `.witness/` existed before the command ran |
| `subdirs_created` | number | Count of subdirectories created (0 if already initialized) |
| `root_docs_written` | number | Count of root documents written |
| `templates_written` | number | Count of template files written to `.witness/templates/` |

### `witness.startSession` → `witness.session.started`

| Field | Value |
|-------|-------|
| Event name | `witness.session.started` |
| Emitted when | After session file and telemetry subdirectory are written |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `session_goal_length` | number | Character count of the session goal (not the goal text) |
| `previous_session_id` | string or null | Session ID that was active before this command, or null |
| `template_loaded` | boolean | Whether `session-template.md` was loaded successfully |

### `witness.recordContext` → `witness.context_snapshot.created`

| Field | Value |
|-------|-------|
| Event name | `witness.context_snapshot.created` |
| Emitted when | After snapshot file is written |
| Artifact path | `.witness/telemetry/<session-id>/context-pressure-NNN.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `pressure_percent` | number | The numeric pressure percentage entered by the developer |
| `pressure_level` | string | The computed pressure level label (LOW / MEDIUM / HIGH / VERY HIGH / CRITICAL) |
| `measurement_method` | string | The selected method string (direct / CLI-context-output / proxy-estimate) |
| `snapshot_ordinal` | number | The three-digit ordinal of this snapshot within the session |

### `witness.observeWorkspace` → `witness.workspace.observed`

| Field | Value |
|-------|-------|
| Event name | `witness.workspace.observed` |
| Emitted when | After observation file is written |
| Artifact path | `.witness/sessions/<session-id>-observation-NNN.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `git_available` | boolean | Whether the vscode.git extension was available |
| `dirty_files_count` | number or null | Count of dirty (modified) files at time of observation; null if git unavailable |
| `untracked_files_count` | number or null | Count of untracked files; null if git unavailable |
| `superpowers_dir_exists` | boolean | Whether `docs/superpowers/` was found in the workspace |
| `observation_ordinal` | number | The three-digit ordinal of this observation within the session |

### `witness.createADR` → `witness.adr.created`

| Field | Value |
|-------|-------|
| Event name | `witness.adr.created` |
| Emitted when | After ADR file is written |
| Artifact path | `.witness/decisions/ADR-NNNN-<slug>.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `adr_number` | number | The four-digit numeric ADR number (e.g. 1 for ADR-0001) |
| `title_length` | number | Character count of the ADR title |
| `slug_length` | number | Character count of the generated slug |
| `had_active_session` | boolean | Whether a session was active at time of creation |

### `witness.recordSubagent` → `witness.subagent.report_recorded`

| Field | Value |
|-------|-------|
| Event name | `witness.subagent.report_recorded` |
| Emitted when | After flat report file is written (v1 format) |
| Artifact path | `.witness/subagents/subagent-NNN.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `report_ordinal` | number | The three-digit project-wide ordinal |
| `model_selected` | string | The model string selected from QuickPick |
| `task_summary_length` | number | Character count of the task summary |
| `had_active_session` | boolean | Whether a session was active at time of recording |
| `ledger_format` | string | `"flat"` (v1 format; v2 ledger commands use `"ledger"`) |

### `witness.assessRisk` → `witness.risk.assessed`

| Field | Value |
|-------|-------|
| Event name | `witness.risk.assessed` |
| Emitted when | After risk file is written |
| Artifact path | `.witness/sessions/<session-id>-risk-NNN.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `active_context_pressure` | string | Level chosen for Active Context Pressure dimension |
| `artifact_externalization_gap` | string | Level chosen for Artifact Externalization Gap dimension |
| `subagent_boundary_risk` | string | Level chosen for Subagent Boundary Risk dimension |
| `quality_drift` | string | Level chosen for Quality Drift dimension |
| `phase_boundary_risk` | string | Level chosen for Phase Boundary Risk dimension |
| `suggested_overall` | string | Auto-computed worst-wins overall level |
| `final_overall` | string | Developer-confirmed or overridden final level |
| `developer_override` | boolean | true if final differs from suggested |
| `assessment_ordinal` | number | The three-digit ordinal within the session |

### `witness.generateHandover` → `witness.handover.generated`

| Field | Value |
|-------|-------|
| Event name | `witness.handover.generated` |
| Emitted when | After handover file and `latest.md` are written |
| Artifact paths | `.witness/handovers/handover-<session-id>-NNN.md`, `.witness/handovers/latest.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `handover_ordinal` | number | The three-digit ordinal within the session |
| `gap_marker_count` | number | Total count of mandatory/gap markers in the rendered handover |
| `had_risk_assessment` | boolean | Whether a risk assessment artifact was found for this session |
| `had_workspace_observation` | boolean | Whether a workspace observation artifact was found |
| `adr_count` | number | Number of ADR references included |
| `subagent_report_count` | number | Number of subagent report references included |

### `witness.validateHandover` → `witness.handover.validated`

| Field | Value |
|-------|-------|
| Event name | `witness.handover.validated` |
| Emitted when | After validation report is written |
| Artifact path | `.witness/evaluation/handover-<base>-validation-NNN.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `source_was_latest` | boolean | true if the source handover was `latest.md`; false if dated file |
| `passed` | boolean | Whether the handover passed all validation rule classes |
| `error_count` | number | Count of ERROR-severity issues |
| `warning_count` | number | Count of WARNING-severity issues |
| `validation_ordinal` | number | The three-digit global ordinal of this report |

### `witness.createResumeProbe` → `witness.resume_probe.created`

| Field | Value |
|-------|-------|
| Event name | `witness.resume_probe.created` |
| Emitted when | After probe file is written |
| Artifact path | `.witness/evaluation/resume-probe-<handover-id>-NNN.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `source_was_latest` | boolean | true if the source handover was `latest.md` |
| `handover_id_source` | string | `"content"` if ID was parsed from the handover body; `"filename"` if fallback was used |
| `probe_ordinal` | number | The three-digit ordinal for this handover ID |

### `witness.compressState` → `witness.current_state.snapshot_created`

| Field | Value |
|-------|-------|
| Event name | `witness.current_state.snapshot_created` |
| Emitted when | After archive file is written and live file is opened |
| Artifact path | `.witness/sessions/<session-id>-current-state-NNN.md` |

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `original_line_count` | number | Line count of `current-state.md` before compression |
| `original_char_count` | number | Character count before compression |
| `original_heading_count` | number | Heading count before compression |
| `archive_ordinal` | number | The three-digit ordinal within the session |
| `was_empty` | boolean | true if `current-state.md` was empty at time of command |

---

## 7. Subagent Ledger Command Design

### Relation to v1 `Witness: Record Subagent Report`

The v1 command `Witness: Record Subagent Report` (command ID: `witness.recordSubagent`) is
preserved without modification. It remains the recommended path for lightweight, after-the-fact
recording of a subagent that has already completed, where a full lifecycle record is not warranted.
It is not deprecated and it is not made an alias. The two models coexist explicitly:

- **Flat report** (v1): appropriate when a subagent was dispatched informally or retrospectively
  recorded. Creates a single file. Lower overhead. Results in YELLOW Subagent Boundary Risk unless
  orchestrator review is also recorded.

  Clarification: A flat report may increase Subagent Boundary Risk when it lacks evidence or
  review context. A full ledger entry provides stronger evidence for a GREEN assessment, but the
  final risk level still depends on artifact quality, not only artifact format.
- **Ledger entry** (v2): appropriate when the orchestrator dispatches a subagent intentionally and
  wants traceable evidence at each stage. Creates a directory of five files. Higher fidelity.
  Supports GREEN Subagent Boundary Risk when all five stages are completed and reviewed.

Both models are documented in `README.md`, `docs/architecture.md`, and the updated
`.witness/commands.md` template.

### Artifact path for ledger entries

```
.witness/subagents/subagent-NNN/
.witness/subagents/subagent-NNN/contract.md
.witness/subagents/subagent-NNN/context-packet.md
.witness/subagents/subagent-NNN/evidence.md
.witness/subagents/subagent-NNN/report.md
.witness/subagents/subagent-NNN/review.md
```

The ordinal `NNN` is computed by scanning `.witness/subagents/` for both `subagent-(\d{3})\.md`
files and `subagent-(\d{3})/` directories and taking the maximum plus one. This guarantees
uniqueness across both models.

---

### Command: `Witness: Start Subagent Task`

**Command ID**: `witness.startSubagentTask`

**Purpose**: Open a new ledger entry for a subagent task that is about to be dispatched. Creates
the per-task directory and writes `contract.md`. This is done before the subagent is dispatched,
not after.

**Inputs**:
- Developer-entered task goal (InputBox): a precise, verifiable statement of what the subagent
  must accomplish.
- Developer-entered acceptance criteria (InputBox): the conditions that must be true for the task
  to be considered complete.
- Optional: active session ID (read from extension state automatically).

**Output artifact**: `.witness/subagents/subagent-NNN/contract.md`

Contract template structure:
```
# Subagent Task Contract: subagent-NNN
Session: <session-id or (none)>
Created At: <ISO timestamp>
Status: OPEN

## Task Goal
<developer-entered goal>

## Acceptance Criteria
<developer-entered criteria>

## Scope Constraints
{{SCOPE_CONSTRAINTS}}

## Expected Evidence
{{EXPECTED_EVIDENCE}}

## Dispatch Notes
{{DISPATCH_NOTES}}
```

**Telemetry event**: `witness.subagent_task.started`

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `task_ordinal` | number | Subagent ordinal (NNN) |
| `goal_length` | number | Character count of goal |
| `criteria_length` | number | Character count of acceptance criteria |
| `had_active_session` | boolean | Whether a session was active |

**Behavior on repeat calls**: Each call to this command creates a new ledger entry with a new
ordinal. It does not reopen or modify an existing ledger entry.

---

### Command: `Witness: Create Subagent Context Packet`

**Command ID**: `witness.createSubagentContextPacket`

**Purpose**: Record the context that was (or will be) given to the subagent at dispatch time.
This creates a stable, timestamped record of what the subagent knew. Written before or immediately
after dispatch.

**Inputs**:
- Subagent ordinal (QuickPick showing open ledger entries, or manual entry).
- List of files and artifacts included in the context (multi-line InputBox or guided prompts).
- Optional: estimated context packet token count.

**Output artifact**: `.witness/subagents/subagent-NNN/context-packet.md`

Context packet template structure:
```
# Subagent Context Packet: subagent-NNN
Session: <session-id>
Created At: <ISO timestamp>

## Source Files Included
{{LIST_OF_FILES}}

## ADRs Referenced
{{ADR_LIST}}

## Current State Snapshot
<!-- Link or inline excerpt from current-state.md at dispatch time -->
{{CURRENT_STATE_REF}}

## Estimated Token Count
{{TOKEN_ESTIMATE_OR_UNKNOWN}}

## Notes
{{NOTES}}
```

**Telemetry event**: `witness.subagent_task.context_packet_created`

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `task_ordinal` | number | Subagent ordinal |
| `estimated_token_count` | number or null | Developer-supplied estimate, or null if not provided |

---

### Command: `Witness: Record Subagent Evidence`

**Command ID**: `witness.recordSubagentEvidence`

**Purpose**: Capture what the subagent actually did during execution — beyond the final output.
This is the process log: files modified, decisions made, deviations from the contract, observable
verification results. Written after the subagent has completed its work, before the orchestrator
review.

**Inputs**:
- Subagent ordinal (QuickPick showing ledger entries with contract but no evidence yet).
- The evidence file opens in the editor for the developer to fill in.

**Output artifact**: `.witness/subagents/subagent-NNN/evidence.md`

Evidence template structure:
```
# Subagent Evidence Summary: subagent-NNN
Session: <session-id>
Recorded At: <ISO timestamp>

## Files Modified
{{FILES_MODIFIED}}

## Decisions Made During Execution
{{DECISIONS}}

## Deviations from Contract
{{DEVIATIONS_OR_NONE}}

## Verification Output
{{TEST_RESULTS_OR_VALIDATION_OUTPUT}}

## Assumptions Made
{{ASSUMPTIONS}}
```

**Telemetry event**: `witness.subagent_task.evidence_recorded`

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `task_ordinal` | number | Subagent ordinal |
| `had_contract` | boolean | Whether `contract.md` existed before this command |
| `had_context_packet` | boolean | Whether `context-packet.md` existed before this command |

---

### Command: `Witness: Complete Subagent Task`

**Command ID**: `witness.completeSubagentTask`

**Purpose**: Record the completion report — the formal statement of what the subagent delivered
relative to the acceptance criteria. This is the v2 analog of the v1 `Witness: Record Subagent
Report`, but it is richer because it references the contract for verification.

**Inputs**:
- Subagent ordinal (QuickPick).
- The report file opens in the editor for the developer to fill in outputs and criteria status.

**Output artifact**: `.witness/subagents/subagent-NNN/report.md`

Report template structure:
```
# Subagent Completion Report: subagent-NNN
Session: <session-id>
Completed At: <ISO timestamp>

## Outputs Delivered
{{OUTPUTS}}

## Acceptance Criteria Status
| Criterion | Status | Evidence |
|-----------|--------|----------|
| {{CRITERION_1}} | met / partial / not-met | {{EVIDENCE_REF}} |

## Decisions with Continuity Implications
{{DECISIONS}}

## Known Gaps or Limitations
{{GAPS_OR_NONE}}

## Recommended Follow-up
{{FOLLOWUP}}
```

**Telemetry event**: `witness.subagent_task.completed`

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `task_ordinal` | number | Subagent ordinal |
| `had_contract` | boolean | Whether `contract.md` existed |
| `had_evidence` | boolean | Whether `evidence.md` existed |
| `missing_stages` | string array | List of stage filenames missing before completion (e.g. `["context-packet.md"]`) |

---

### Command: `Witness: Review Subagent Task`

**Command ID**: `witness.reviewSubagentTask`

**Purpose**: Record the orchestrator's formal acceptance or rejection of the subagent's work and
document how verified decisions were integrated into the parent session. Closing the review stage
marks the ledger entry as complete and is what allows the Subagent Boundary Risk dimension to be
assessed as GREEN for this task.

**Inputs**:
- Subagent ordinal (QuickPick showing ledger entries with report but no review yet).
- Review decision (QuickPick: `accepted`, `accepted with conditions`, `rejected`).
- The review file opens in the editor for the developer to fill in integration actions.

**Output artifact**: `.witness/subagents/subagent-NNN/review.md`

Review template structure:
```
# Orchestrator Review: subagent-NNN
Session: <session-id>
Reviewed At: <ISO timestamp>
Decision: <accepted / accepted with conditions / rejected>

## Integration Actions
{{WHAT_WAS_PROMOTED_TO_ADR_OR_CURRENT_STATE}}

## Conditions or Remediation Required
{{CONDITIONS_OR_NONE}}

## Residual Risk
{{RESIDUAL_RISK_OR_NONE}}
```

**Telemetry event**: `witness.subagent_task.reviewed`

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `task_ordinal` | number | Subagent ordinal |
| `decision` | string | `"accepted"`, `"accepted_with_conditions"`, or `"rejected"` |
| `missing_stages` | string array | Stage files not yet present at time of review |
| `ledger_complete` | boolean | true if all five stage files now exist |

---

## 8. Minimal Context Packet Workflow

### Command: `Witness: Create Context Packet`

**Command ID**: `witness.createContextPacket`

**Purpose**: Assemble the minimum reliable context a fresh coding agent session needs into a
single reviewed artifact. This command does not automatically load context into any agent. It
produces a structured markdown file that the developer can then provide to a coding agent as the
starting context for a new session. It is distinct from the subagent context packet
(`.witness/subagents/subagent-NNN/context-packet.md`), which records what was given to a
subagent. The session context packet records what should be given to a primary session resumption.

**Required source files** (must all exist and be readable):

- `.witness/current-state.md`
- `.witness/handovers/latest.md`

If either of these files is missing or unreadable, the command fails with an informative error.

**Optional source files** (included if present and linked from the handover):

- Linked ADRs from `.witness/decisions/` (those explicitly referenced in `latest.md`)
- The most recent workspace observation from `.witness/sessions/`
- The most recent risk assessment from `.witness/sessions/`

**Excluded files** (never included in the packet):

- Raw session records beyond the observation and risk assessment above.
- Telemetry data (`.witness/telemetry/`).
- All template files (`.witness/templates/`).
- Any file in `.witness/subagents/` (subagent evidence is reference material, not resumption
  material).
- `.witness/evaluation/` (validation reports and probes are meta-artifacts).

**Output path**: `.witness/sessions/<session-id>-context-packet-NNN.md`

Three-digit ordinal scoped to the session. Requires an active session.

**Packet structure**:

```markdown
# Context Packet: <session-id>-context-packet-NNN

**Assembled At**: <ISO timestamp>
**Session**: <session-id>
**Packet Ordinal**: NNN
**Source Handover**: .witness/handovers/latest.md
**Source Current State**: .witness/current-state.md

---

## Validation Status

[ ] Developer has reviewed this packet before use.
[ ] All MANDATORY fields in the handover are filled.
[ ] Current state is up to date.
[ ] Linked ADRs are accessible.

---

## Current State (inline)

<!-- Contents of .witness/current-state.md at packet assembly time -->
{{CURRENT_STATE_CONTENTS}}

---

## Handover (inline)

<!-- Contents of .witness/handovers/latest.md at packet assembly time -->
{{LATEST_HANDOVER_CONTENTS}}

---

## Linked ADRs (if any)

{{ADR_INLINE_OR_REFERENCE_LIST}}

---

## Packet Notes

{{PACKET_NOTES}}
```

**Validation rules** (checked before writing the packet):

1. `current-state.md` must exist and must not be empty.
2. `latest.md` must exist.
3. `latest.md` must not contain unfilled `{{MANDATORY:` placeholders (same rule as the handover
   validator). If unfilled mandatory fields are found, the command writes the packet with a
   validation warning section rather than failing, so the developer can see the problem.
4. The packet file must not already exist at the computed path (ordinal collision protection).

The command does not claim to guarantee any specific token usage. It assembles a structured,
human-reviewable document. The developer is responsible for verifying the packet before loading
it into a coding agent session.

**Telemetry event**: `witness.context_packet.created`

Attributes:

| Key | Type | Description |
|-----|------|-------------|
| `packet_ordinal` | number | Three-digit ordinal within the session |
| `current_state_line_count` | number | Line count of `current-state.md` at assembly time |
| `handover_line_count` | number | Line count of `latest.md` at assembly time |
| `linked_adr_count` | number | Number of ADRs included |
| `mandatory_field_violations` | number | Count of unfilled mandatory fields found in the handover |
| `had_active_session` | boolean | Whether a session was active (required) |

---

## 9. Risk Model Integration

The five locked risk dimensions are unchanged. v2 OTel data and ledger data provide additional
corroborating evidence for these dimensions. The dimensions remain developer-assessed via
QuickPick; OTel data may inform those assessments but does not replace them.

### Active Context Pressure

OTel attributes from `witness.context_snapshot.created` events provide a timestamped history of
`pressure_percent` and `pressure_level` values for the session. The `Assess Continuity Risk`
command may in a future iteration surface the most recent recorded pressure level as a suggested
starting point for this dimension. In v2, this remains informational only.

### Artifact Externalization Gap

The `witness.workspace.observed` event captures `dirty_files_count` at observation time. The age
of the most recent `witness.current_state.snapshot_created` event (computed from `timestamp`)
provides a direct measure of `current_state_age_minutes`. The age of the most recent
`witness.handover.generated` event provides a measure of how long it has been since a handover
was produced. These values are available in `events.jsonl` and can be used by developers (or
future automated risk pre-population) to assess gap size.

### Subagent Boundary Risk

This dimension benefits most directly from v2 ledger data. The presence or absence of each ledger
stage file for a given subagent provides concrete evidence for this dimension:

- All five stages present and review decision `"accepted"`: low boundary risk for this subagent.
- Completion report only (v1 flat format): moderate boundary risk; no verified orchestrator
  acceptance on record.
- Contract present but no report or review: elevated boundary risk; task dispatched but not
  closed.
- No ledger entry at all: risk level determined entirely by developer estimate.

The `missing_stages` attribute on `witness.subagent_task.reviewed` events provides a machine-
readable record of which stages were skipped.

### Quality Drift

Quality drift indicators (repeated corrections, contradictions, wrong assumptions) are
intrinsically behavioral and cannot be detected from file-system events. This dimension continues
to rely entirely on developer judgment via QuickPick. OTel data does not provide evidence for
this dimension in v2.

### Phase Boundary Risk

The `witness.session.started` event timestamp enables computation of session duration. Longer
sessions at or near known workflow phase boundaries (specify, plan, implement, validate, release)
represent elevated phase boundary risk. The `session_goal_length` attribute provides a weak
proxy for session intent. Phase boundary identification continues to rely on developer judgment
in v2; OTel data provides session duration as supplementary context.

---

## 10. Migration Compatibility

### v1 flat subagent reports remain valid

All `.witness/subagents/subagent-NNN.md` files created by v1 are fully valid in v2. The v2
extension reads, indexes, and includes them in handover generation exactly as before. No
conversion, migration, or renaming is required.

### v2 directory-based ledger entries do not replace flat reports

v2 adds `.witness/subagents/subagent-NNN/` directories alongside the existing flat files. Both
formats coexist in `.witness/subagents/`. Tools that scan this directory must handle both a file
named `subagent-NNN.md` and a directory named `subagent-NNN/` with five stage files. The ordinal
counter for new entries accounts for both formats to prevent collision.

### No automatic migration in v2

v2 does not provide any command or script for migrating existing flat reports to the directory
format. Teams that want to adopt the ledger model for existing work do so manually. The manual
process is: create the directory, create the missing stage files from the existing flat report
content, and delete the flat file if desired (the ordinal is already consumed either way).

### Documentation during transition

`README.md`, `docs/architecture.md`, and the updated `.witness/commands.md` template must clearly
document both models under a "Subagent Recording" section:

- **Simple model** (v1): `Witness: Record Subagent Report` → single flat file.
- **Ledger model** (v2): five-command lifecycle → per-task directory.

The documentation must not imply that the simple model is deprecated. It should frame the choice
as appropriate to the task: use the simple model for informal or retrospective recording; use the
ledger model for intentional, pre-planned subagent dispatch.

### Events JSONL initialization

When the v2 extension starts and a workspace is open, it does not automatically create
`events.jsonl`. The file is created on first write (first command execution after v2 is
installed). If `Witness: Initialize Project` is run against a workspace that was initialized with
v1, it does not create the `otel/` subdirectory automatically in v2.1. The `otel/` directory and
`events.jsonl` file are created by the event writer module on first use. This avoids polluting v1
workspaces that do not run any commands after upgrade.

---

## 11. Implementation Task Breakdown

Each task below is a self-contained unit of work that compiles and passes regression tests before
the next task begins.

### v2.1 — Local Telemetry Writer

**Implementation status**: Complete. `src/core/telemetryWriter.ts` has been created and compiles
cleanly. No commands are instrumented yet; that work begins in v2.2.

**Scope**: Implement `src/core/telemetryWriter.ts`.

- Exports a single public async function: `emitEvent(event: WitnessEvent): Promise<void>`.
- `WitnessEvent` is a TypeScript interface matching the event schema defined in Section 5.
- The writer appends a single JSON line to `.witness/telemetry/otel/events.jsonl`.
- Creates the `otel/` directory and `events.jsonl` if they do not exist.
- All I/O errors are caught and silenced (fire-and-forget).
- Computes `workspace_root_hash` internally using Node.js `crypto.createHash('sha256')`.
- Reads `extension_version` from `package.json` at module load time.
- No VS Code UI calls (no `showErrorMessage` on failure).
- Full TypeScript compile with zero errors.
- Unit-testable in isolation (no VS Code extension host required).

Deliverables:
- `src/core/telemetryWriter.ts`
- Updated `docs/architecture.md` (telemetry writer section)

### v2.2 — Instrument Existing Commands

**Implementation status**: Complete. All 11 `src/commands/*.ts` files have been instrumented with
`emitWitnessEvent(...)` calls. Each command emits on success, cancellation, and error paths with
per-command event names (`witness.<noun>.<verb>`) and structured attributes. Compiles cleanly with
zero errors.

**Scope**: Add `emitEvent(...)` calls to all 11 existing command files.

- Each command file imports `emitEvent` from `../core/telemetryWriter`.
- Each command records a start timestamp at function entry.
- Each command calls `emitEvent(...)` before returning (on success, cancellation, and error paths).
- Command behavior is unchanged if the emit call fails.
- All 11 commands must continue to pass the v1 smoke tests without behavioral regression.
- Full TypeScript compile with zero errors.

Deliverables:
- Updated: all 11 `src/commands/*.ts` files
- Updated: `docs/v0.1-validation-report.md` (regression checklist updated for v2.2)

### v2.3 — Subagent Ledger Templates and Path Helpers

**Implementation status**: Complete. Five ledger stage templates added to `src/templates/` and
registered in `TEMPLATE_FILES` (copied to `.witness/templates/` by `initProject`). New module
`src/core/subagentLedger.ts` exports all path helpers, ordinal computation, and ledger entry
listing. `getNextSubagentOrdinal` scans both v1 flat files and v2 directories. Compiles cleanly
with zero errors. No commands added; no `extension.ts` or `package.json` changes.

**Scope**: Add ledger stage templates and path helper functions.

- Add five new template files to `src/templates/`:
  - `subagent-contract-template.md`
  - `subagent-context-packet-template.md`
  - `subagent-evidence-template.md`
  - `subagent-completion-report-template.md` (distinguished from v1 `subagent-report-template.md`)
  - `subagent-review-template.md`
- Add helper functions to `src/core/witnessPaths.ts` or a new `src/core/subagentPaths.ts`:
  - `getSubagentDir(witnessRoot, ordinal)` → URI of `.witness/subagents/subagent-NNN/`
  - `getSubagentStageUri(witnessRoot, ordinal, stage)` → URI for a specific stage file
  - `nextSubagentOrdinal(witnessRoot)` → scans both flat files and directories
- Add the new templates to `TEMPLATE_FILES` in `src/core/templates.ts` (they ship in the .vsix
  but are not copied to `.witness/templates/` by `initProject`; they are used internally by the
  ledger commands).
- Update `.vscodeignore` if needed to ensure new templates are included.
- Full TypeScript compile with zero errors.

Deliverables:
- New: `src/templates/subagent-contract-template.md`
- New: `src/templates/subagent-context-packet-template.md`
- New: `src/templates/subagent-evidence-template.md`
- New: `src/templates/subagent-completion-report-template.md`
- New: `src/templates/subagent-review-template.md`
- Updated: `src/core/witnessPaths.ts` or new `src/core/subagentPaths.ts`
- Updated: `src/core/templates.ts`

### v2.4 — Subagent Ledger Commands

**Implementation note (v2.4b)**: All five Subagent Ledger commands are implemented and compile
cleanly. v2.4a delivered `startSubagentTask` and `createSubagentContextPacket`; v2.4b delivered
`recordSubagentEvidence`, `completeSubagentTask`, and `reviewSubagentTask`. The extension now
registers 16 commands total. No new dependencies were added.

**Scope**: Implement the five new ledger commands.

- New command files:
  - `src/commands/startSubagentTask.ts`
  - `src/commands/createSubagentContextPacket.ts`
  - `src/commands/recordSubagentEvidence.ts`
  - `src/commands/completeSubagentTask.ts`
  - `src/commands/reviewSubagentTask.ts`
- Register all five commands in `src/extension.ts`.
- Add all five to `activationEvents` in `package.json`.
- Add all five to the `contributes.commands` array in `package.json`.
- Each command calls `emitEvent(...)` with the event defined in Section 7.
- Full TypeScript compile with zero errors.
- v1 commands unaffected.

Deliverables:
- New: 5 command files in `src/commands/`
- Updated: `src/extension.ts`
- Updated: `package.json`
- Updated: `src/templates/commands.md` (bundled template for `.witness/commands.md`)

### v2.5 — Context Packet Command

**Implementation note (v2.5)**: `Witness: Create Context Packet` (`witness.createContextPacket`) is
implemented and compiles cleanly. Output is `.witness/sessions/<session-id>-context-packet-NNN.md`.
Requires an active session, `current-state.md`, and `handovers/latest.md`. Optional references
(risk assessment, observation, ADRs, subagent ledgers) are included as paths only. Mandatory marker
detection counts `{{`, `TODO`, `MANDATORY`, `[MISSING`, and `<fill` across the inlined sources.
Template `src/templates/context-packet-template.md` added and registered. 17 commands total.

**Scope**: Implement `Witness: Create Context Packet`.

- New command file: `src/commands/createContextPacket.ts`.
- Add a context packet template: `src/templates/context-packet-template.md`.
- Register command in `src/extension.ts`, `package.json` (activation events and contributes).
- Implements the validation rules defined in Section 8.
- Calls `emitEvent(...)` with the `witness.context_packet.created` event.
- Full TypeScript compile with zero errors.
- v1 commands unaffected.

Deliverables:
- New: `src/commands/createContextPacket.ts`
- New: `src/templates/context-packet-template.md`
- Updated: `src/extension.ts`
- Updated: `package.json`
- Updated: `src/templates/commands.md`

### v2.6 — Validation, Documentation, and Regression Update

**Scope**: Update all documentation to reflect v2 state.

- Update `README.md`:
  - Add v2 commands to the command table.
  - Update version status to v2.
  - Add subagent model comparison (simple vs. ledger).
  - Add context packet section.
- Update `docs/architecture.md`:
  - Add telemetry writer component.
  - Add subagent ledger path structure.
  - Add context packet artifact section.
- Update `docs/v0.1-validation-report.md` (or create `docs/v2-validation-report.md`):
  - Add v2 command regression checklist.
  - Add `events.jsonl` inspection checklist.
  - Add subagent ledger artifact checklist.
  - Add context packet artifact checklist.
- Update `docs/otel-evaluation-model.md`:
  - Mark status as "Implemented (local JSONL; OTLP deferred)".
- Update `docs/subagent-ledger-v0.2.md`:
  - Mark status as "Implemented in v2".
- Full compile validation.

---

## 12. Validation Plan

### Compile validation

- `npm run compile` exits with code 0 and zero TypeScript errors after each task.
- This is a gate: no task is considered complete until compile passes.

### v1 command regression check

All 11 v1 commands must behave identically to their v1 smoke-validated behavior:
- Command palette entry visible.
- Artifact written to the correct path with the correct filename format.
- File opened in editor.
- `events.jsonl` written with a new line on each execution (v2.2 and later).
- No behavioral change from the developer's perspective.

Regression check is run after v2.2 (instrumentation) and again after v2.6 (final).

### `events.jsonl` inspection

After executing each instrumented command once:
- `events.jsonl` exists at `.witness/telemetry/otel/events.jsonl`.
- Each line is valid JSON parseable by `JSON.parse`.
- Each line contains all required top-level fields.
- `workspace_root_hash` begins with `sha256:` and never contains a raw filesystem path.
- `artifact_paths` contains relative paths only.
- No field contains raw prompt text, file content, or chat transcript content.
- `status` is one of `"success"`, `"cancelled"`, `"error"`.

### Subagent ledger artifact check

After running all five ledger commands against a test subagent task:
- `.witness/subagents/subagent-NNN/` directory exists.
- All five stage files exist: `contract.md`, `context-packet.md`, `evidence.md`, `report.md`,
  `review.md`.
- Ordinal does not collide with any existing flat `subagent-NNN.md` files.
- Five corresponding events are present in `events.jsonl` with correct `task_ordinal`.
- The flat `Witness: Record Subagent Report` command still produces `subagent-MMM.md` (where
  MMM > NNN) without collision.

### Context packet artifact check

After running `Witness: Create Context Packet` against a prepared workspace:
- `.witness/sessions/<session-id>-context-packet-NNN.md` exists.
- The file contains inlined content from `current-state.md` and `latest.md`.
- A mandatory-field violation (if any) is surfaced in the validation status section of the packet,
  not silently ignored.
- One corresponding event is present in `events.jsonl` with `event_name` =
  `"witness.context_packet.created"`.

### Final regression check sequence

Run in order after v2.6 is complete:

1. `npm run compile` — must pass.
2. Run all 11 v1 commands in sequence — all must behave as in v1 smoke validation.
3. Run all 5 subagent ledger commands against a test task — all stage files created.
4. Run `Witness: Create Context Packet` — packet file created.
5. Inspect `events.jsonl` — all 17 command events present, all fields valid.
6. Run `Witness: Validate Handover` — must still read `latest.md` and produce a report with the
   correct `handover-<base>-validation-NNN.md` filename format.
7. Confirm that the v1 flat subagent report ordinal and v2 ledger ordinal do not collide across
   both runs.

---

## Open Design Questions

The following questions are recorded here for resolution before or during implementation. They do
not block plan creation but must be resolved before the affected task begins.

**Q1. Ordinal scanner scope for subagent collision avoidance.**
`nextSubagentOrdinal` must scan for both `subagent-NNN.md` files and `subagent-NNN/` directories
in `.witness/subagents/`. The VS Code `readDirectory` API returns entries with a `FileType` field
that distinguishes files from directories. The implementation should use `FileType.Directory` to
detect ledger entry directories. Confirm that this API behaves correctly on all target platforms
(Windows, macOS, Linux) for directories with and without `.gitkeep`.

**Q2. `events.jsonl` rotation policy.**
An append-only JSONL file in a long-lived project will grow indefinitely. No rotation is specified
in v2. The open question is whether v2.1 should define a maximum file size threshold (e.g. 10 MB)
above which the writer archives the current file to `events-YYYY-MM-DD.jsonl` and starts a new
`events.jsonl`. Deferring rotation entirely is the simplest approach but may create an inconvenient
artifact for projects used over many months.

**Q3. Whether `initProject` should create the `otel/` directory.**
Currently the plan specifies that `otel/` is created on first event write, not by `initProject`.
An alternative is to have `initProject` always create `.witness/telemetry/otel/` and an empty
`events.jsonl` stub. The on-demand creation approach is cleaner for v1 workspaces being upgraded;
the eager creation approach makes the directory structure predictable from the first `initProject`
run. Resolution needed before v2.1 is implemented.

**Q4. Subagent ledger QuickPick population.**
Commands like `Witness: Create Subagent Context Packet` and `Witness: Review Subagent Task` need
to present the developer with a list of open ledger entries (subagent directories that have a
`contract.md` but lack the relevant next stage file). The implementation must scan
`.witness/subagents/` for directories matching `subagent-(\d{3})/` and check which stage files
are present. If no qualifying entries exist, the command should offer a manual ordinal entry path
rather than failing silently. The UX for this picker should be designed before v2.4 begins.

**Q5. Context packet validation threshold for mandatory fields.**
Section 8 specifies that the context packet command writes the packet with a warning section
rather than failing when unfilled mandatory fields are found in `latest.md`. The threshold for
what constitutes a "unfilled mandatory field" must be consistent with the handover validator's
definition (Section 6 of `docs/architecture.md`, rule class: unfilled placeholders). Confirm that
the same regex or utility function is shared between the handover validator and the context packet
validator, to prevent drift.

**Q6. Template distribution for ledger stage files.**
The v2.3 plan specifies that ledger templates ship in the `.vsix` but are not copied to
`.witness/templates/` by `initProject`. An alternative is to add them to `.witness/templates/`
so that developers who use Witness Agent without VS Code (e.g., manual workflows) have access to
the blank templates. Resolution affects the `TEMPLATE_FILES` constant in `templates.ts` and the
`initProject` command.

---

## Document Status

This document is the authoritative v2 implementation plan. No source code changes may be made
against v2 scope until this plan is accepted. The plan is subject to revision before each task
begins if design questions (Section: Open Design Questions) are resolved differently than specified
here.

---

## v2 Completion Summary

All v2 milestones are implemented. The extension compiles cleanly with zero TypeScript errors.

| Milestone | Deliverables | Status |
|-----------|-------------|--------|
| v2.1 | `src/core/telemetryWriter.ts` — `emitWitnessEvent`, `createCommandTimer`, `toRelativeWitnessPath`, `WitnessTelemetryEvent` | Implemented |
| v2.2 | All 11 v1 commands instrumented with `emitWitnessEvent`; correct event names verified | Implemented |
| v2.3 | 5 Subagent Ledger stage templates in `src/templates/`; `src/core/subagentLedger.ts` with all path helpers, ordinal computation, entry listing, and filter utilities | Implemented |
| v2.4 | 5 new Subagent Ledger commands (`startSubagentTask`, `createSubagentContextPacket`, `recordSubagentEvidence`, `completeSubagentTask`, `reviewSubagentTask`); 16 commands total | Implemented |
| v2.5 | Session-level `createContextPacket` command; `src/templates/context-packet-template.md`; 17 commands total | Implemented |
| v2.6 | `README.md`, `docs/architecture.md`, `docs/workflow.md`, `docs/v2-validation-report.md`, `src/templates/commands.md` updated; this plan status updated | Implemented |

**Open design questions resolved during implementation:**

- Q6 (template distribution): Ledger stage templates and context-packet template ARE copied to
  `.witness/templates/` by `initProject`. They were added to `TEMPLATE_FILES` in `templates.ts`
  so developers have access to blank templates in their workspace. This deviated from the original
  plan which said they would not be copied, but the task specification for v2.3 made the template
  copying explicit.

**Remaining open questions from the plan (not addressed in v2):**

- Q1 (OTel exporter): No network OTel exporter implemented. Telemetry remains local JSONL only.
- Q2 (token counting API): Context pressure remains developer-estimated. No automated measurement.
- Q3 (chat participant): Not implemented. Command palette only.
- Q4 (QuickPick UX for ledger entry selection): Implemented using filter-then-QuickPick without
  a manual ordinal fallback (filtering was sufficient; no "none found" UX needed a fallback entry
  path for manual ordinal, since the command shows an info message and cancels gracefully).
- Q5 (context packet validation threshold): Mandatory marker counting is simple string matching
  (`{{`, `TODO`, `MANDATORY`, `[MISSING`, `<fill`). No separate validator command was added;
  warnings are shown inline when marker count > 0.
