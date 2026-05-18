# Witness Agent v2 — Validation Report

**Report Version**: 1.0

**Date**: 2026-05-14

**Coverage**: v2.1 through v2.5 (all 17 commands)

---

## Validation Objective

The objective of v2 validation is to confirm that all 17 Witness Agent commands are implemented,
compile without TypeScript errors, and produce the correct artifacts and behaviors when executed
in a real VS Code workspace. Regression validation ensures the original 11 v1 commands remain
unchanged and backward-compatible.

Validation is performed against a real workspace (not a mock or simulated environment) to ensure
that file system operations, template loading, and VS Code API interactions behave as expected
under actual extension host conditions.

---

## Validation Scope

### Extension Version

v2 (package.json version `0.1.0`)

### Compiler

TypeScript 5.3.x via `tsc -p ./`

### VS Code Engine Target

`^1.85.0`

### Validation Environment

Extension Development Host launched via F5 in VS Code. Workspace: a real project directory.

---

## Milestone Status

| Milestone | Scope | Status |
|-----------|-------|--------|
| v2.1 | Local OTel-style telemetry writer (`src/core/telemetryWriter.ts`) | Source-level validated |
| v2.2 | Instrument all 11 v1 commands with telemetry | Smoke-tested |
| v2.3 | Subagent Ledger templates and path helpers (`src/core/subagentLedger.ts`) | Compile/source validated |
| v2.4 | Full Subagent Ledger lifecycle commands (5 new commands) | Smoke-tested |
| v2.5 | Session-level `Witness: Create Context Packet` | Smoke-tested |
| v2.6 | Documentation and regression update | In progress |

---

## Full Command Set Under Validation

All 17 commands. Command IDs and display names must not change without an explicit product
decision.

| # | Command Title | Command ID | v1/v2 | Status |
|---|---------------|------------|-------|--------|
| 1 | Witness: Initialize Project | `witness.initProject` | v1 | Source-confirmed; smoke-confirmed |
| 2 | Witness: Start Session | `witness.startSession` | v1 | Source-confirmed; smoke-confirmed |
| 3 | Witness: Record Context Snapshot | `witness.recordContext` | v1 | Source-confirmed; smoke-confirmed |
| 4 | Witness: Observe Workspace | `witness.observeWorkspace` | v1 | Source-confirmed; smoke-confirmed |
| 5 | Witness: Create ADR | `witness.createADR` | v1 | Source-confirmed; smoke-confirmed |
| 6 | Witness: Record Subagent Report | `witness.recordSubagent` | v1 | Source-confirmed; smoke-confirmed |
| 7 | Witness: Assess Continuity Risk | `witness.assessRisk` | v1 | Source-confirmed; smoke-confirmed |
| 8 | Witness: Generate Handover | `witness.generateHandover` | v1 | Source-confirmed; smoke-confirmed |
| 9 | Witness: Validate Handover | `witness.validateHandover` | v1 | Source-confirmed; smoke-confirmed |
| 10 | Witness: Create Resume Probe | `witness.createResumeProbe` | v1 | Source-confirmed; smoke-confirmed |
| 11 | Witness: Compress Current State | `witness.compressState` | v1 | Source-confirmed; smoke-confirmed |
| 12 | Witness: Start Subagent Task | `witness.startSubagentTask` | v2 | Source-confirmed; smoke-confirmed |
| 13 | Witness: Create Subagent Context Packet | `witness.createSubagentContextPacket` | v2 | Source-confirmed; smoke-confirmed |
| 14 | Witness: Record Subagent Evidence | `witness.recordSubagentEvidence` | v2 | Source-confirmed |
| 15 | Witness: Complete Subagent Task | `witness.completeSubagentTask` | v2 | Source-confirmed |
| 16 | Witness: Review Subagent Task | `witness.reviewSubagentTask` | v2 | Source-confirmed |
| 17 | Witness: Create Context Packet | `witness.createContextPacket` | v2 | Source-confirmed; smoke-confirmed |

---

## Artifact Paths (Source-Verified, v2)

Paths for the 11 original v1 commands are unchanged. See `docs/v0.1-validation-report.md` for
the full v1 artifact path table. New v2 artifacts are listed below.

### After `Witness: Start Subagent Task`

```
.witness/subagents/subagent-NNN/contract.md   (opened in editor)
```

Three-digit zero-padded ordinal. The ordinal counter spans both v1 flat files
(`subagent-NNN.md`) and v2 ledger directories (`subagent-NNN/`) so numbers are never reused.

### After `Witness: Create Subagent Context Packet`

```
.witness/subagents/subagent-NNN/context-packet.md   (opened in editor)
```

Written to the existing `subagent-NNN/` directory. Create-or-overwrite semantics (context
assembly is iterative).

### After `Witness: Record Subagent Evidence`

```
.witness/subagents/subagent-NNN/evidence.md   (opened in editor)
```

Written only if missing. If already present, an error is shown and the write is aborted.

### After `Witness: Complete Subagent Task`

```
.witness/subagents/subagent-NNN/report.md   (opened in editor)
```

Written only if missing. Completion status (complete, complete-with-warnings, blocked, failed)
is substituted into the template's Status field.

### After `Witness: Review Subagent Task`

```
.witness/subagents/subagent-NNN/review.md   (opened in editor)
```

Written only if missing. Review decision (accepted, accepted-with-conditions, rejected) is
substituted into the template's Review Decision field.

### Full Subagent Ledger Entry

After all five stages are complete:

```
.witness/subagents/subagent-NNN/
├── contract.md
├── context-packet.md
├── evidence.md
├── report.md
└── review.md
```

### After `Witness: Create Context Packet`

```
.witness/sessions/<session-id>-context-packet-NNN.md   (opened in editor)
```

Three-digit zero-padded ordinal scoped to the active session. Inlines `current-state.md` and
`handovers/latest.md`. Includes reference paths for the latest risk assessment, latest
observation, ADRs referenced in the handover, and subagent entries linked to the session.

### Telemetry (all commands)

```
.witness/telemetry/otel/events.jsonl   (appended on every command execution)
```

Each record is a single-line JSON object. Created on first command execution. Appended
thereafter. Never overwritten.

---

## Compile Validation

- [x] `npm run compile` exits with code 0 and zero TypeScript errors (v2 state)
- [x] 17 commands registered in `extension.ts`
- [x] 17 commands in `package.json` `contributes.commands`
- [x] 17 activation events in `package.json` `activationEvents`
- [x] No new runtime dependencies added in v2 (`devDependencies` unchanged)

---

## Telemetry Validation

- [x] `events.jsonl` is created by `emitWitnessEvent` when it does not exist
- [x] `events.jsonl` is appended to (not overwritten) on subsequent executions
- [x] Events are written as single-line JSON (JSONL format)
- [x] Each event includes: `timestamp`, `event_name`, `command_id`, `session_id`, `status`,
  `duration_ms`, `artifact_paths`, `attributes` (source-confirmed)
- [x] No prompt text written to telemetry (source-confirmed; privacy invariant enforced)
- [x] No file contents written to telemetry (source-confirmed; privacy invariant enforced)
- [x] No absolute paths written to telemetry (source-confirmed; `toRelativeWitnessPath` used)
- [ ] End-to-end telemetry verification against a known sequence of commands (pending detailed
  artifact evidence)

### Expected telemetry event names

| Command | Event Name |
|---------|-----------|
| `witness.initProject` | `witness.project.initialized` |
| `witness.startSession` | `witness.session.started` |
| `witness.recordContext` | `witness.context_snapshot.created` |
| `witness.observeWorkspace` | `witness.workspace.observed` |
| `witness.createADR` | `witness.adr.created` |
| `witness.recordSubagent` | `witness.subagent.report_recorded` |
| `witness.assessRisk` | `witness.risk.assessed` |
| `witness.generateHandover` | `witness.handover.generated` |
| `witness.validateHandover` | `witness.handover.validated` |
| `witness.createResumeProbe` | `witness.resume_probe.created` |
| `witness.compressState` | `witness.current_state.snapshot_created` |
| `witness.startSubagentTask` | `witness.subagent_task.started` |
| `witness.createSubagentContextPacket` | `witness.subagent_task.context_packet_created` |
| `witness.recordSubagentEvidence` | `witness.subagent_task.evidence_recorded` |
| `witness.completeSubagentTask` | `witness.subagent_task.completed` |
| `witness.reviewSubagentTask` | `witness.subagent_task.reviewed` |
| `witness.createContextPacket` | `witness.context_packet.created` |

---

## Subagent Ledger End-to-End Check

Validates the full five-stage lifecycle for a single subagent task.

- [ ] Run `Witness: Start Subagent Task` — confirm `subagent-001/contract.md` created
- [ ] Run `Witness: Create Subagent Context Packet` — confirm `subagent-001/context-packet.md` created
- [ ] Run `Witness: Record Subagent Evidence` — confirm `subagent-001/evidence.md` created
- [ ] Run `Witness: Complete Subagent Task` — confirm `subagent-001/report.md` created
- [ ] Run `Witness: Review Subagent Task` — confirm `subagent-001/review.md` created
- [ ] Confirm `events.jsonl` contains all five telemetry events with correct ordinals
- [ ] Confirm ordinal counter increments correctly on second task (`subagent-002/`)
- [ ] Confirm v1 flat files (`subagent-NNN.md`) and v2 ledger dirs share the same ordinal counter

---

## Session Context Packet Check

- [x] Requires active session — error shown and cancelled event emitted if no session (source-confirmed)
- [x] Requires `current-state.md` — error shown and error event emitted if missing (source-confirmed)
- [x] Requires `handovers/latest.md` — error shown and error event emitted if missing (source-confirmed)
- [x] Packet written to `.witness/sessions/<session-id>-context-packet-NNN.md` (source-confirmed)
- [x] Packet inlines `current-state.md` and `handovers/latest.md` (source-confirmed)
- [x] Optional references included as paths only — no content inlined (source-confirmed)
- [x] Mandatory marker detection counts `{{`, `TODO`, `MANDATORY`, `[MISSING`, `<fill` (source-confirmed)
- [x] Warning shown if mandatory marker count > 0 (source-confirmed)
- [x] Telemetry event emitted with all specified attributes (source-confirmed)
- [ ] End-to-end smoke test: packet file exists, opens in editor, contains correct content

---

## Privacy and Minimization Checks

- [x] No prompt text written to any telemetry event (source-confirmed; enforced in all 17 commands)
- [x] No file contents written to any telemetry event (source-confirmed)
- [x] No chat transcripts or chain-of-thought written anywhere by any command (source-confirmed)
- [x] Telemetry artifact paths are workspace-relative, not absolute (source-confirmed; `toRelativeWitnessPath` used)
- [x] Context packet inlines only `current-state.md` and `handovers/latest.md` — this is
  by design and is the purpose of the artifact (source-confirmed)
- [x] Context packet explicitly excludes `events.jsonl`, session archives, all subagent evidence,
  and templates (source-confirmed; Excluded Context section in template)
- [x] Subagent context packet includes source file references provided by the developer —
  it does not scan or inline files automatically (source-confirmed)

---

## Regression Checks for v1 Commands

These checks confirm that v2 instrumentation did not change the behavioral output of the original
11 commands.

- [x] `witness.initProject` still creates the same directory structure and root docs (source-confirmed; only telemetry emit added)
- [x] `witness.startSession` still writes to `sessions/<session-id>.md` and sets `.current-session` (source-confirmed)
- [x] `witness.recordContext` still writes to `telemetry/<session-id>/context-pressure-NNN.md` (source-confirmed)
- [x] `witness.observeWorkspace` still writes to `sessions/<session-id>-observation-NNN.md` (source-confirmed)
- [x] `witness.createADR` still writes to `decisions/ADR-NNNN-<slug>.md` (source-confirmed)
- [x] `witness.recordSubagent` still writes to `subagents/subagent-NNN.md` (v1 flat format, unchanged) (source-confirmed)
- [x] `witness.assessRisk` still writes to `sessions/<session-id>-risk-NNN.md` (source-confirmed)
- [x] `witness.generateHandover` still writes to `handovers/handover-<session-id>-NNN.md` and `handovers/latest.md` (source-confirmed)
- [x] `witness.validateHandover` still writes to `evaluation/handover-<base>-validation-NNN.md` (source-confirmed)
- [x] `witness.createResumeProbe` still writes to `evaluation/resume-probe-<handover-id>-NNN.md` (source-confirmed)
- [x] `witness.compressState` still archives to `sessions/<session-id>-current-state-NNN.md` and opens live file (source-confirmed)
- [x] v2 Subagent Ledger ordinal counter includes v1 flat files — no ordinal reuse (source-confirmed; `getNextSubagentOrdinal` scans both)

---

## Initialize Project: v2 Template Registration Check

`Witness: Initialize Project` copies all `TEMPLATE_FILES` entries into `.witness/templates/`.
In v2, `TEMPLATE_FILES` contains 12 entries.

- [x] `session-template.md` (v1)
- [x] `context-pressure-template.md` (v1)
- [x] `subagent-report-template.md` (v1)
- [x] `adr-template.md` (v1)
- [x] `handover-template.md` (v1)
- [x] `resume-probe-template.md` (v1)
- [x] `subagent-contract-template.md` (v2.3)
- [x] `subagent-context-packet-template.md` (v2.3)
- [x] `subagent-evidence-template.md` (v2.3)
- [x] `subagent-completion-report-template.md` (v2.3)
- [x] `subagent-review-template.md` (v2.3)
- [x] `context-packet-template.md` (v2.5)

---

## Known Limitations Carried from v1

1. **Context pressure is estimated, not measured.** `Witness: Record Context Snapshot` accepts a
   developer-supplied estimate. There is no automated token counting or context window API.

2. **Git dependency for Observe Workspace.** The command depends on the `vscode.git` extension
   API. In workspaces without git or with the git extension inactive, git state is reported as
   unavailable rather than crashing.

3. **No `@witness` chat participant.** Interaction is entirely through the command palette.

4. **No dashboard UI.** There is no visual panel for risk level or active session state.

5. **No marketplace publishing.** The extension runs only in development mode via F5.

6. **Detailed artifact evidence not stored.** Concrete artifact samples from smoke validation
   sessions are not committed to the repository.

---

## Known Limitations Added in v2

7. **Context packet ordinal is session-scoped.** The ordinal for context packets resets per
   session. If a session has many context packets, ordinals will be high. There is no global
   context packet counter.

8. **ADR extraction in context packet is link-syntax only.** The command extracts ADR references
   from handover text by scanning for `../decisions/*.md` links. ADRs mentioned in prose without
   a markdown link are not detected.

9. **Subagent ledger scan reads contract.md only.** When checking whether a v2 ledger entry
   belongs to the current session, only `contract.md` is read. Stage files that reference the
   session in their bodies but whose `contract.md` does not are not detected.

---

## Revision History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-05-14 | Initial v2 report. Covers all 17 commands. Milestone status table, full command checklist, artifact paths, telemetry validation, Subagent Ledger end-to-end check, session context packet check, privacy checks, and v1 regression checks. |
