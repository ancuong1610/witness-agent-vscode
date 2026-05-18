# Witness Agent — v3 Implementation Plan

**Status**: v3.0 plan accepted. v3.1 implemented and compile-validated (2026-05-15).
v3.2 implemented and compile-validated (2026-05-15). v3.3 implemented and compile-validated (2026-05-15).
v3.4 implemented and compile-validated (2026-05-15). Status bar assistant live; 18 public commands +
1 internal status bar command (witness.openStatusActions, not in package.json contributes).
v3.5 implemented and compile-validated (2026-05-15). Guided workflow commands live: witness.checkpointNow,
witness.prepareSessionSwitch, witness.resumeSession. 21 public commands total. No new dependencies.
v3.6 implemented (2026-05-15). Evaluation Summary command live: witness.generateEvaluationSummary.
22 public commands total. Core module: src/core/evaluationSummary.ts. Command:
src/commands/generateEvaluationSummary.ts. Writes to .witness/evaluation/evaluation-summary-<session>-NNN.md.
**v3 UX principle locked (2026-05-15)**. Background Continuity Assistant UX principle and
automatic/confirmed boundary documented in docs/product-ux-principles.md, README.md, architecture.md,
and workflow.md. No new features or commands added.
**v3.7 documentation/regression cleanup completed (2026-05-15). v3 closed.**
15-rule table in architecture.md corrected to match src/core/suggestedActions.ts exactly.
v3-validation-report.md updated with smoke-test markers and corrected rule-number references.
22 public commands. Internal witness.openStatusActions not contributed. No dependencies added.

**Prerequisite**: v2 is complete and smoke-validated. All 17 commands are implemented. Local
OTel-style telemetry, the Subagent Ledger lifecycle, and the session-level Context Packet are
confirmed working.

---

## 1. v3 Summary

v3 turns Witness from a manual artifact command system into a background continuity guidance
layer. v1 established the artifact model and the command palette interface. v2 added structured
local telemetry, the five-stage Subagent Ledger lifecycle, and the session-level Context Packet.
v3 adds the layer that reads what v1 and v2 wrote, computes the continuity status of the
workspace, detects incomplete or blocked subagent workflows, and surfaces the most relevant next
safe action to the developer without requiring them to remember the command sequence manually.

v3 does not execute actions on the developer's behalf. It does not modify artifacts automatically.
It reads `.witness/` deterministically and presents guidance. The developer decides whether to
act on any suggestion. The term "continuity risk" is used throughout v3 to describe the observable
signals that accumulate when workflow artifacts age, subagent work is left unreviewed, or session
transitions are not formally managed. v3 surfaces these signals as guidance, not as automated
corrections. The term "observable context degradation" describes the measurable growth of staleness
indicators in the `.witness/` artifact set that v3 computes and presents.

v3 adds no LLM inference, no coding assistance, no automatic context injection, and no raw chat
or reasoning capture. It is a VS Code-first, file-system-backed, deterministic guidance layer.

---

## 2. Goals

The following capabilities are in scope for v3.

**Workspace status scanner.** Read `.witness/` on activation and after every Witness command
execution. Compute a structured `WitnessWorkspaceStatus` record describing the age and completeness
of every key artifact category. Make this record available to all v3 components without repeated
filesystem reads.

**Subagent health monitor.** Classify every subagent ledger entry (and every v1 flat report) by
a health level: healthy, needs-review, incomplete, blocked, or loop-risk. Health classification
is deterministic, based on which stage files are present, how old they are, and what the reported
status and review decision fields contain.

**Suggested actions engine.** Select the single most relevant next action from a fixed priority
list, based on the current `WitnessWorkspaceStatus`. The engine applies deterministic rules in
priority order and outputs a `WitnessSuggestedAction` with a label, reason, optional command ID,
and severity. The engine never calls an LLM.

**`Witness: Show Workspace Status` command.** A new command that runs the workspace status scanner
on demand and presents the result as a structured, human-readable markdown summary in the VS Code
output panel or a new editor tab. This is the primary v3 user-facing entry point.

**Status bar assistant.** A VS Code status bar item that reflects the current workspace health
at a glance. Updates after every Witness command and after `.witness/` file save events. Shows
one of five labels. Clicking it opens a QuickPick of recommended actions.

**Guided workflow commands.** A small set of compound commands that chain multiple Witness
operations into a prompted, confirmation-gated sequence. These commands guide; they do not
auto-execute. Every destructive or irreversible step requires explicit confirmation.

**Evaluation summary command.** A new command that reads the full `.witness/` artifact set for
the active session and produces a human-readable session-level evaluation summary as a markdown
file in `.witness/evaluation/`.

---

## 3. Non-Goals

The following are explicitly out of scope for v3.

**No LLM agent.** v3 does not call any LLM API, embed a language model, or use Claude, Copilot,
or any other inference endpoint. All logic is deterministic rule evaluation over filesystem state.

**No automatic session switching.** v3 does not change the active session ID, create new sessions,
or archive old sessions without explicit developer action. The guided workflow commands ask for
confirmation at every step that would change session state.

**No automatic current-state rewriting.** v3 does not modify `current-state.md`, `latest.md`,
any handover, or any context packet automatically. Compression, archiving, and handover generation
remain developer-initiated command-palette actions.

**No raw chat transcript capture.** v3 does not read, process, or store any chat transcript from
any coding agent session. No Copilot chat, Claude chat, or other agent conversation data is
accessed.

**No hidden reasoning capture.** v3 does not capture or store internal chain-of-thought, model
reasoning, or intermediate inference outputs of any kind.

**No full webview dashboard.** v3 uses the VS Code status bar and QuickPick for interactive
guidance. A full webview panel with a visual dashboard is deferred past v3.

**No backend OTLP export.** Telemetry remains local JSONL in `.witness/telemetry/otel/events.jsonl`.
No network transport, no OTLP collector endpoint, and no remote observability backend is added
in v3.

**No guaranteed token reduction claims.** v3 does not make any claim about reducing token usage
or improving context window efficiency. It surfaces observable context degradation signals that
the developer can act on, but the outcome depends entirely on developer judgment and action.

---

## 4. Proposed v3 Modules

v3 adds the following source files. No existing files are modified in v3.0 planning. All module
paths are relative to the project root.

### `src/core/workspaceStatus.ts`

**Purpose**: Compute the overall Witness workspace status from `.witness/` artifacts.

This module is the foundation of v3. It performs a lightweight, targeted scan of the known
`.witness/` artifact paths. It does not walk the full workspace. It does not read file contents
beyond what is necessary to extract timestamps, status fields, and file existence. It exports a
single async function that returns a `WitnessWorkspaceStatus` record. All other v3 modules consume
this record rather than performing their own filesystem reads.

### `src/core/subagentHealth.ts`

**Purpose**: Classify each subagent ledger entry by a health level.

This module reads the subagent directory structure (both v1 flat files and v2 ledger directories),
determines which stage files are present for each entry, and applies classification rules to assign
a health level. It exports a list of per-entry health records and a summary roll-up. It is consumed
by the workspace status scanner and by the evaluation summary command.

### `src/core/suggestedActions.ts`

**Purpose**: Select the most useful next action based on deterministic rules applied to the
`WitnessWorkspaceStatus` record.

This module implements a fixed priority list of rules. Each rule is a predicate over the status
record. The first rule whose predicate is true determines the output. The output is a single
`WitnessSuggestedAction`. The module is stateless; it takes a `WitnessWorkspaceStatus` and
returns a `WitnessSuggestedAction`. It does not read the filesystem.

### `src/core/evaluationSummary.ts` (optional, v3.6)

**Purpose**: Compute and format a session-level evaluation summary from the `.witness/` artifact set.

This module reads the full set of artifacts associated with the active session and compiles them
into a structured summary. It is optional in the sense that it is only exercised by the
`Witness: Generate Evaluation Summary` command added in v3.6, but it is a planned module, not
a stretch goal.

---

## 5. Workspace Status Model

The following TypeScript-style types define the data contract for v3. These are planning-level
type definitions. The actual implementation may add helper methods or adjust field types for VS Code
URI compatibility, but the semantic contract of each field is locked at this stage.

```typescript
interface WitnessWorkspaceStatus {
  // Presence
  hasWitness: boolean;                    // .witness/ directory exists
  activeSessionId: string | null;         // session ID from extension state, or null

  // Source-of-truth artifacts
  currentStateExists: boolean;
  currentStateAgeMinutes: number | null;  // null if file does not exist

  latestHandoverExists: boolean;
  latestHandoverAgeMinutes: number | null;

  latestContextPacketExists: boolean;
  latestContextPacketAgeMinutes: number | null;

  // Risk
  latestRiskLevel: string | null;         // GREEN / YELLOW / ORANGE / RED, or null if none
  latestRiskAgeMinutes: number | null;

  // Subagent health
  pendingSubagentReviews: number;         // ledger entries with report but no review
  incompleteSubagentLedgers: number;      // contract exists but missing report or review
  blockedOrFailedSubagents: number;       // report status is blocked or failed

  // Telemetry
  telemetryEventsExists: boolean;
  telemetryEventCount: number;            // 0 if file does not exist

  // Guidance
  suggestedAction: WitnessSuggestedAction;
}

interface WitnessSuggestedAction {
  id: string;                             // stable identifier for this action type
  label: string;                          // human-readable label (used in status bar QuickPick)
  reason: string;                         // one-sentence explanation of why this is suggested
  commandId?: string;                     // VS Code command ID to invoke, if applicable
  severity: 'info' | 'warning' | 'critical';
}
```

**Age computation.** All `*AgeMinutes` fields are computed as the difference between the current
wall-clock time and the file's last-modified timestamp as returned by `vscode.workspace.fs.stat`.
The computation uses `stat.mtime` in milliseconds, converted to minutes, rounded down. A file
that was modified two seconds ago has an age of 0. A file that does not exist has a `null` age.

**Session-scoped artifacts.** `latestContextPacketAgeMinutes` refers to the most recent
`<session-id>-context-packet-NNN.md` across all sessions, not just the active session. This is
intentional: if the active session has no context packet, but a recent prior session does, that
is still informative. The same applies to `latestRiskLevel` and `latestRiskAgeMinutes`.

**`pendingSubagentReviews`.** Count of v2 ledger entries where `report.md` exists but `review.md`
does not. Does not include v1 flat reports (those have no review stage).

**`incompleteSubagentLedgers`.** Count of v2 ledger entries where `contract.md` exists but either
`report.md` or `review.md` is absent. `pendingSubagentReviews` is a subset of this count.

**`blockedOrFailedSubagents`.** Count of ledger entries (v2) and flat reports (v1) where the
report body contains a status field indicating `blocked` or `failed`.

---

## 6. v3.1 Plan — Workspace Status Scanner and Show Workspace Status

### Scope

Implement `src/core/workspaceStatus.ts` and the `Witness: Show Workspace Status` command.

**No status bar in this milestone.** No background scanning. No QuickPick. The command is the
only entry point.

### `src/core/workspaceStatus.ts` implementation notes

- Export a single async function: `computeWorkspaceStatus(witnessRoot: vscode.Uri):
  Promise<WitnessWorkspaceStatus>`.
- The function performs targeted `vscode.workspace.fs.stat` calls on known artifact paths. It does
  not list directories unless needed for subagent scanning. It does not read file contents.
- Age computation uses `stat.mtime`. All ages are in whole minutes.
- For `telemetryEventCount`, read `events.jsonl` as a byte stream and count newline characters.
  This avoids JSON-parsing the entire file. If the file does not exist, count is 0.
- The function must not throw. All individual `stat` failures are caught and treated as
  "file does not exist." The caller always receives a complete `WitnessWorkspaceStatus` record.
- Computing `suggestedAction` requires calling `suggestedActions.ts` as an internal step.
  The workspace status function calls the suggested actions module before returning the record.

### `Witness: Show Workspace Status` command

**Command ID**: `witness.showWorkspaceStatus`

**Behavior**:

1. Guard: if no workspace is open, show an error and return.
2. Guard: if `.witness/` does not exist, show an informative message explaining that the project
   has not been initialized and suggest `Witness: Initialize Project`.
3. Call `computeWorkspaceStatus`.
4. Format the result as a structured markdown summary.
5. Write the summary to a new unsaved editor tab (using `vscode.workspace.openTextDocument` with
   `language: 'markdown'`) or to the Witness output channel. The exact presentation surface is
   an open design question (see Section 14).
6. Emit a telemetry event: `witness.workspace_status.shown` with attributes summarizing the
   computed health signals (counts and risk level, not artifact content).

**Markdown summary format** (planned):

```
# Witness Workspace Status
Computed at: <timestamp>
Active session: <session-id or "none">

## Continuity Artifacts
- Current state: <exists / missing> (<N minutes old>)
- Latest handover: <exists / missing> (<N minutes old>)
- Latest context packet: <exists / missing> (<N minutes old>)
- Latest risk assessment: <level> (<N minutes old>)

## Subagent Health
- Pending reviews: <N>
- Incomplete ledgers: <N>
- Blocked or failed: <N>

## Telemetry
- Events recorded: <N>

## Suggested Action
[<severity>] <label>
Reason: <reason>
Command: <commandId or "none">
```

All field values are derived from `WitnessWorkspaceStatus`. No interpretation beyond what the
record provides is added by the formatter.

### Deliverables

- New: `src/core/workspaceStatus.ts`
- New: `src/core/suggestedActions.ts` (required by workspaceStatus; see Section 8)
- New: `src/commands/showWorkspaceStatus.ts`
- Updated: `src/extension.ts` (register command)
- Updated: `package.json` (activation event, contributes.commands entry)
- Updated: `docs/v3-implementation-plan.md` (status annotation)

---

## 7. v3.2 Plan — Subagent Health Monitor

### Scope

Implement `src/core/subagentHealth.ts` and integrate it into `workspaceStatus.ts`.

### Health levels

Each subagent ledger entry is classified into exactly one of the following health levels:

| Level | Meaning |
|-------|---------|
| `healthy` | All five stage files present; review decision is `accepted` or `accepted-with-conditions`. |
| `needs-review` | Report exists, review does not. Orchestrator has not closed the loop. |
| `incomplete` | Contract exists, but report is absent. Task was dispatched but not formally completed. |
| `blocked` | Report or evidence body contains a status indicating `blocked` or `failed`. |
| `loop-risk` | Evidence exists but report does not, and the evidence is older than a threshold (default: 60 minutes). Indicates a subagent may have stopped without completing. |

For v1 flat reports (single `.witness/subagents/subagent-NNN.md` files), the health level is
`needs-review` by default, because the flat format has no review stage. If the report body
contains a status of `blocked` or `failed`, the level is `blocked`.

### Classification rules (applied in order)

1. If the ledger directory has a `review.md` with a decision of `accepted` or
   `accepted-with-conditions`, and all five stage files are present: `healthy`.
2. If `report.md` exists and `review.md` does not: `needs-review`.
3. If `report.md` or `evidence.md` contains a status field with value `blocked` or `failed`:
   `blocked`.
4. If `evidence.md` exists, `report.md` does not, and the evidence file age exceeds the loop-risk
   threshold: `loop-risk`.
5. If `contract.md` exists and `report.md` does not: `incomplete`.
6. Default for v1 flat reports: `needs-review`.

### Module exports

```typescript
interface SubagentHealthRecord {
  ordinal: number;
  format: 'flat' | 'ledger';
  healthLevel: 'healthy' | 'needs-review' | 'incomplete' | 'blocked' | 'loop-risk';
  stagesPresent: string[];        // e.g. ['contract.md', 'evidence.md']
  stagesMissing: string[];
  ageMinutes: number | null;      // age of the most recently modified stage file
  reviewDecision: string | null;  // 'accepted', 'accepted-with-conditions', 'rejected', or null
}

interface SubagentHealthSummary {
  entries: SubagentHealthRecord[];
  totalCount: number;
  healthyCount: number;
  needsReviewCount: number;
  incompleteCount: number;
  blockedCount: number;
  loopRiskCount: number;
}

async function computeSubagentHealth(witnessRoot: vscode.Uri): Promise<SubagentHealthSummary>;
```

### Integration with workspaceStatus.ts

`computeWorkspaceStatus` calls `computeSubagentHealth` internally to populate the
`pendingSubagentReviews`, `incompleteSubagentLedgers`, and `blockedOrFailedSubagents` fields of
`WitnessWorkspaceStatus`. The `SubagentHealthSummary` record is not exposed directly in the
workspace status type; only the three aggregate counts are propagated.

The `Witness: Show Workspace Status` command gains a per-entry subagent health table when this
module is integrated. The table shows ordinal, format, health level, and missing stages for each
entry.

### Deliverables

- New: `src/core/subagentHealth.ts`
- Updated: `src/core/workspaceStatus.ts` (calls subagent health)
- Updated: `src/commands/showWorkspaceStatus.ts` (per-entry health table in output)
- Updated: `docs/v3-implementation-plan.md` (status annotation)

---

## 8. v3.3 Plan — Suggested Actions Engine

### Scope

Implement `src/core/suggestedActions.ts` and integrate it as the final step of `computeWorkspaceStatus`.

### Rules (applied in strict priority order)

Each rule is a predicate over `WitnessWorkspaceStatus`. The first matching rule determines the
output. All thresholds are named constants in the module, not magic numbers.

| Priority | Condition | Action ID | Label | Severity |
|----------|-----------|-----------|-------|----------|
| 1 | `hasWitness` is false | `init-project` | Initialize Project | `warning` |
| 2 | `activeSessionId` is null | `start-session` | Start Session | `warning` |
| 3 | `blockedOrFailedSubagents` > 0 | `review-blocked-subagent` | Review Blocked Subagent | `critical` |
| 4 | `latestRiskLevel` is `RED` or `BLOCKED` and handover absent or stale | `address-red-risk` | Address Red Risk | `critical` |
| 5 | `latestRiskLevel` is `ORANGE` and handover absent or stale | `review-orange-risk` | Review Orange Risk | `warning` |
| 6 | `pendingSubagentReviews` > 0 | `review-subagent` | Review Subagent Task | `warning` |
| 7 | `subagentHealthSummary.loopRiskCount` > 0 | `check-subagent-loop-risk` | Check Subagent Loop Risk | `warning` |
| 8 | `incompleteSubagentLedgers` > 0 | `check-subagent-progress` | Check Subagent Progress | `warning` |
| 9 | `currentStateExists` and `currentStateAgeMinutes` exceeds stale threshold | `refresh-current-state` | Refresh Current State | `warning` |
| 10 | `currentStateExists` is false | `capture-current-state` | Capture Current State | `warning` |
| 11 | `latestHandoverExists` is true and `latestContextPacketExists` is false | `create-context-packet` | Create Context Packet | `info` |
| 12 | `latestHandoverExists` is true and `latestHandoverAgeMinutes` exceeds stale threshold | `refresh-handover` | Refresh Handover | `warning` |
| 13 | `latestContextPacketHasMandatoryMarkers` is true | `review-context-packet` | Review Context Packet | `warning` |
| 14 | `telemetryEventsExists` is false | `telemetry-not-active` | Telemetry Not Active | `info` |
| 15 | Default (all conditions nominal) | `all-clear` | All Clear | `info` |

**"Handover absent or stale"** (used in rules 4 and 5): `latestHandoverAgeMinutes` is null (file does not
exist) or `latestHandoverAgeMinutes` exceeds `STALE_HANDOVER_MINUTES`. Risk at RED/BLOCKED/ORANGE with
no fresh handover means the risk is active and the continuity record is incomplete or missing.

**Threshold values** (defaults; named constants):

- `STALE_CURRENT_STATE_MINUTES`: 120 (2 hours)
- `STALE_HANDOVER_MINUTES`: 180 (3 hours)
- `LOOP_RISK_EVIDENCE_MINUTES`: 60

These defaults are intentionally conservative. A future v3 revision may make them configurable
via VS Code settings, but v3.0 uses fixed constants.

**Mandatory marker check for rule 13.** The context packet check reads the first 4096 bytes of
the most recent context packet file to detect mandatory markers (the same pattern as the v2
`createContextPacket` command: `{{`, `TODO`, `MANDATORY`, `[MISSING`, `<fill`). If markers are
found, rule 13 fires. If no markers are found, the packet is considered reviewed and the engine
falls through to rules 14 and 15.

### Module signature

```typescript
function selectSuggestedAction(status: WitnessWorkspaceStatus): WitnessSuggestedAction;
```

The function is synchronous. It operates on the already-computed `WitnessWorkspaceStatus` record.
The mandatory marker check for rule 13 is the one exception: it requires an async read. This is
handled by pre-computing the marker presence as part of `computeWorkspaceStatus` and storing the
result in `latestContextPacketHasMandatoryMarkers` before `selectSuggestedAction` is called.

### Deliverables

- New: `src/core/suggestedActions.ts`
- Updated: `src/core/workspaceStatus.ts` (calls suggestedActions as final step)
- Updated: `docs/v3-implementation-plan.md` (status annotation)

---

## 9. v3.4 Plan — Status Bar Assistant

### Scope

Add a VS Code status bar item that reflects the current workspace health. Update the item after
every Witness command execution and after `.witness/` file save events.

### Status labels

The status bar item text is one of five values, derived from the `WitnessSuggestedAction.severity`
and the active session state:

| Status bar text | Condition |
|-----------------|-----------|
| `Witness: No Session` | `activeSessionId` is null |
| `Witness: OK` | Severity is `info` and action ID is `all-clear` |
| `Witness: Checkpoint` | Severity is `info` and action ID is not `all-clear` (a low-priority action is suggested) |
| `Witness: Review Needed` | Severity is `warning` |
| `Witness: Attention` | Severity is `critical` |

The status bar item is positioned at the right side of the status bar. It uses a neutral color
for `OK` and `No Session`, an amber-equivalent theme color for `Checkpoint` and `Review Needed`,
and a red-equivalent theme color for `Attention`. VS Code status bar colors use the
`statusBarItem.warningBackground` and `statusBarItem.errorBackground` theme contributions.

### Click behavior

Clicking the status bar item opens a VS Code QuickPick listing the currently suggested action
first, followed by a fixed set of commonly useful Witness commands. The QuickPick does not re-run
the workspace scanner; it presents the most recently computed suggestion. Selecting an item
executes the corresponding command via `vscode.commands.executeCommand`.

The QuickPick always includes at minimum:
- The currently suggested action (if it has a `commandId`)
- `Witness: Show Workspace Status`
- `Witness: Assess Continuity Risk`
- `Witness: Generate Handover`
- `Witness: Create Context Packet`

### Update triggers

The status bar item updates on the following events:

- Extension activation (initial compute).
- After any Witness command completes (post-command hook registered in `extension.ts`).
- After a file save event in which the saved file path is inside `.witness/` (using
  `vscode.workspace.onDidSaveTextDocument`).

An optional debounce of 2000 ms is applied to file save events to avoid rapid recomputation when
multiple `.witness/` files are saved in sequence (e.g., after a git checkout).

### Deliverables

- New: `src/core/statusBar.ts` (status bar item lifecycle, update logic, QuickPick handler)
- Updated: `src/extension.ts` (create and register status bar item on activation)
- Updated: `docs/v3-implementation-plan.md` (status annotation)

---

## 10. v3.5 Plan — Guided Workflow Commands

### Scope

Add three compound commands that guide the developer through multi-step Witness workflows with
explicit confirmation at each step. These commands orchestrate existing v1 and v2 commands via
`vscode.commands.executeCommand`. They do not implement artifact writing logic themselves.

### Command: `Witness: Checkpoint Now`

**Command ID**: `witness.checkpointNow`

**Purpose**: Guide the developer through a quick continuity checkpoint: observe the workspace,
assess risk, and either compress the current state or generate a handover depending on the
assessed risk level.

**Steps**:

1. Show an information message: "Checkpoint Now will guide you through observing the workspace,
   assessing continuity risk, and acting on the result. Continue?" with buttons `Continue` and
   `Cancel`. If `Cancel`, return.
2. Execute `witness.observeWorkspace`. If the user cancels the inner command, stop.
3. Execute `witness.assessRisk`. If the user cancels, stop.
4. Show a QuickPick: "What would you like to do next?" with options:
   - `Compress Current State` (executes `witness.compressState`)
   - `Generate Handover` (executes `witness.generateHandover`)
   - `Do nothing — checkpoint complete`
5. Execute the selected command. If `Do nothing`, show a completion message and return.
6. Emit a telemetry event: `witness.workflow.checkpoint_completed`.

The command does not auto-select between compress and handover. The developer decides based on
what the risk assessment revealed. The command is a guided sequence, not an automated decision.

### Command: `Witness: Prepare Session Switch`

**Command ID**: `witness.prepareSessionSwitch`

**Purpose**: Guide the developer through the full pre-switch artifact sequence: generate a
handover, validate it, create a resume probe, and create a context packet. This is the recommended
pre-switch workflow defined in `docs/workflow.md`, exposed as a single guided command.

**Steps**:

1. Guard: if no active session, show an error and return.
2. Show an information message: "Prepare Session Switch will guide you through generating a
   handover, validating it, creating a resume probe, and assembling a context packet. These steps
   prepare for a clean session handover. Continue?" with buttons `Continue` and `Cancel`.
3. Execute `witness.generateHandover`. If cancelled, show: "Session switch preparation cancelled
   at handover generation." and return.
4. Execute `witness.validateHandover`. If cancelled, show a warning that the handover has not
   been validated and offer to continue anyway (QuickPick: `Continue without validation` /
   `Cancel`). If `Cancel`, return.
5. Execute `witness.createResumeProbe`. If cancelled, show a warning and offer to continue.
6. Execute `witness.createContextPacket`. If cancelled, show a warning that the context packet
   was not created.
7. Show a completion message: "Session switch preparation complete. Review the context packet
   before starting a new session."
8. Emit a telemetry event: `witness.workflow.session_switch_prepared`.

The command does not change the active session ID, does not create a new session, and does not
close any files.

### Command: `Witness: Resume Session`

**Command ID**: `witness.resumeSession`

**Purpose**: Guide the developer through the session resume workflow: select a prior session by
choosing its context packet, review the packet, and optionally create a resume probe against the
selected handover.

**Steps**:

1. Scan `.witness/sessions/` for files matching `*-context-packet-*.md`. Present them in a
   QuickPick ordered by most recently modified first. If none are found, show an information
   message: "No context packets found. Use `Witness: Create Context Packet` before switching
   sessions." and return.
2. The developer selects a context packet. Open it in the editor.
3. Show a message: "Review the context packet above. When ready, choose what to do next." with
   a QuickPick: `Create Resume Probe from this handover` / `Start a new session` / `Done`.
4. If `Create Resume Probe from this handover`, execute `witness.createResumeProbe`.
5. If `Start a new session`, execute `witness.startSession`.
6. If `Done`, return.
7. Emit a telemetry event: `witness.workflow.session_resumed`.

The command does not automatically inject the context packet into any agent. It opens the file
for manual review and lets the developer decide how to use it.

### Deliverables

- New: `src/commands/checkpointNow.ts`
- New: `src/commands/prepareSessionSwitch.ts`
- New: `src/commands/resumeSession.ts`
- Updated: `src/extension.ts` (register three commands)
- Updated: `package.json` (activation events, contributes.commands)
- Updated: `src/templates/commands.md` (three new commands listed)
- Updated: `docs/v3-implementation-plan.md` (status annotation)

---

## 11. v3.6 Plan — Evaluation Summary Command

### Scope

Add `Witness: Generate Evaluation Summary` and implement `src/core/evaluationSummary.ts`.

### Command: `Witness: Generate Evaluation Summary`

**Command ID**: `witness.generateEvaluationSummary`

**Purpose**: Produce a human-readable, session-level evaluation summary as a markdown file. The
summary is a retrospective artifact: it describes what happened during the session in terms of
observable Witness activity, subagent lifecycle outcomes, and continuity risk signals. It is not
an LLM-generated analysis. It is a structured document derived entirely from `.witness/` artifact
counts, timestamps, and status fields.

**Output path**: `.witness/evaluation/evaluation-summary-<session-id>.md`

**Summary sections and content**:

The `evaluationSummary.ts` module computes each of the following fields from filesystem state.
None of these fields require reading file contents beyond what is needed for status extraction.

| Section | Fields |
|---------|--------|
| Session | session ID, start time (from session file mtime), summary computed at, session duration in minutes |
| Commands | count of telemetry events in `events.jsonl` attributed to this session ID, list of distinct command IDs recorded |
| Context snapshots | count of `context-pressure-NNN.md` files in `telemetry/<session-id>/`, pressure levels recorded (list of distinct levels) |
| Handovers | count of `handover-<session-id>-NNN.md` files, whether `latest.md` exists |
| Validation | count of `handover-<base>-validation-NNN.md` files for handovers in this session, count passing vs. not passing (derived from file existence; detailed pass/fail requires reading file headers) |
| Context packets | count of `<session-id>-context-packet-NNN.md` files |
| Subagent ledger completion rate | total ledger entries attributed to this session, count in each health level, completion rate expressed as healthy / total |
| Pending reviews | count of entries in `needs-review` health level attributed to this session |
| Blocked or failed subagents | count in `blocked` health level |
| Risk assessments | count of `<session-id>-risk-NNN.md` files, most recent risk level (extracted from file name or header line) |
| Observable context degradation signals | current-state age at summary time, latest handover age at summary time, whether a context packet was created in this session |

**File format**:

```markdown
# Witness Evaluation Summary
Session: <session-id>
Computed At: <ISO timestamp>
Session Duration: <N> minutes

## Command Activity
Total telemetry events: <N>
Commands used: <list>

## Context Snapshots
Count: <N>
Pressure levels recorded: <list>

## Handovers
Count: <N>
Latest.md present: <yes / no>

## Validation Results
Validation reports: <N>

## Context Packets
Count: <N>

## Subagent Ledger
Total entries this session: <N>
Healthy: <N>
Needs Review: <N>
Incomplete: <N>
Blocked: <N>
Loop Risk: <N>
Completion Rate: <healthy/total>
Pending Reviews: <N>
Blocked or Failed: <N>

## Risk Assessments
Count: <N>
Latest Level: <level or "none">

## Observable Context Degradation Signals
Current state age at summary time: <N> minutes
Latest handover age at summary time: <N> minutes
Context packet created this session: <yes / no>

## Notes
{{NOTES}}
```

**Telemetry event**: `witness.evaluation_summary.generated`

Attributes: `session_id`, `event_count`, `subagent_count`, `pending_reviews`,
`blocked_count`, `completion_rate` (as a number 0.0-1.0, or null if no subagents).

### Deliverables

- New: `src/core/evaluationSummary.ts`
- New: `src/commands/generateEvaluationSummary.ts`
- Updated: `src/extension.ts`
- Updated: `package.json`
- Updated: `src/templates/commands.md`
- Updated: `docs/v3-implementation-plan.md` (status annotation)

---

## 12. Background Scanning Policy

v3 deliberately avoids expensive or continuous filesystem scanning. The following policy governs
all background operations.

**Scan on activation.** When the extension activates and a workspace is open, run one initial
`computeWorkspaceStatus` call. This is the only unconditional background scan. It happens once
per activation, not on a timer.

**Scan after Witness commands.** Every Witness command (v1, v2, and v3) triggers a workspace
status recompute after it completes. This is implemented as a post-command hook registered in
`extension.ts`. The recompute is triggered asynchronously and does not block command completion.

**Scan on `.witness/` file save.** A `vscode.workspace.onDidSaveTextDocument` listener checks
whether the saved file's path is inside `.witness/`. If it is, a recompute is triggered. A 2000 ms
debounce is applied to avoid redundant recomputes when multiple files are saved in sequence.

**Optional debounced refresh.** A future v3 revision may add an optional periodic background
refresh (e.g., every 10 minutes) configurable via VS Code settings. v3.0 does not include this.
The three triggers above cover the cases where staleness is most likely to have changed.

**Never scan all workspace files.** The scanner only reads paths it knows about: the fixed set of
`.witness/` subdirectory paths listed in the `WitnessWorkspaceStatus` type definition, plus the
subagent entries returned by `computeSubagentHealth`. It does not use `vscode.workspace.findFiles`
or any glob that could reach the full workspace tree.

**Read minimization.** Artifact existence and age are determined by `stat` calls only. File
contents are read only when required for health classification (limited header scanning for status
fields) or for the mandatory marker check in the suggested actions engine (limited to first 4096
bytes).

---

## 13. Validation Plan

### Compile validation

- `npm run compile` must exit with code 0 and zero TypeScript errors after each milestone.
- This is a gate. No milestone is considered complete until compile passes.

### Command count check

After v3.5:
- 17 (v1 + v2) + 4 (v3: showWorkspaceStatus, checkpointNow, prepareSessionSwitch, resumeSession)
  = 21 commands registered in `extension.ts`.
- After v3.6: 22 commands (plus generateEvaluationSummary).
- Verify count matches `contributes.commands` array length in `package.json`.

### Workspace status scanner — fixture and manual tests

Fixture test: create a `.witness/` directory with known artifact files at known modification
times, call `computeWorkspaceStatus`, and assert that each field matches the expected value.
The fixture does not require a VS Code extension host if the function is written to accept
`vscode.Uri` arguments that can be constructed without an active workspace.

Manual test: open a real workspace with v2 artifacts. Run `Witness: Show Workspace Status`.
Confirm that the output matches visible filesystem state for at minimum: `currentStateAgeMinutes`,
`latestHandoverExists`, `pendingSubagentReviews`, and `suggestedAction.label`.

### Subagent health classifier — fixture and manual tests

Fixture test: create the following ledger entry structures and assert the expected health level:
- All five stages present, review decision `accepted` → `healthy`
- Report present, review absent → `needs-review`
- Contract present, evidence absent, report absent → `incomplete`
- Evidence present, report absent, evidence age > threshold → `loop-risk`
- Report status `blocked` → `blocked`
- v1 flat file → `needs-review`

Manual test: in a workspace with at least one v2 ledger entry, confirm the health level shown
in `Witness: Show Workspace Status` matches the expected level for that entry.

### Status bar — manual smoke test

1. Activate the extension in a workspace without `.witness/`. Confirm status bar shows
   `Witness: No Session` or an appropriate label.
2. Run `Witness: Initialize Project` and `Witness: Start Session`. Confirm status bar updates
   to `Witness: OK`.
3. Age an artifact past its stale threshold (manual modification of mtime, or wait). Trigger a
   rescan by saving a `.witness/` file. Confirm status bar label changes to `Witness: Checkpoint`
   or `Witness: Review Needed`.
4. Click the status bar item. Confirm a QuickPick opens with the suggested action listed first.

### Evaluation summary check

1. Run a full session: start session, observe, assess risk, generate handover, validate, create
   context packet, run at least one subagent ledger workflow to completion.
2. Run `Witness: Generate Evaluation Summary`.
3. Confirm the output file exists at `.witness/evaluation/evaluation-summary-<session-id>.md`.
4. Confirm the file contains correct counts for each section (verify against manual artifact
   inspection).
5. Confirm a telemetry event `witness.evaluation_summary.generated` is present in `events.jsonl`.

### v2 regression check for all 17 commands

Run after every v3 milestone. All 17 v1 + v2 commands must:
- Appear in the command palette.
- Write artifacts to the correct paths.
- Emit telemetry events to `events.jsonl`.
- Exhibit no behavioral change from their v2 smoke-validated state.

---

## 14. Implementation Sequence

The milestones below are ordered by dependency. Each milestone must compile cleanly and pass its
validation checks before the next begins.

### v3.0 — Plan lock

This document. No source changes. No `package.json` changes. Open design questions recorded.
Plan is accepted before v3.1 work begins.

### v3.1 — Workspace Status Scanner and Show Workspace Status

**Status**: Implemented and compile-validated (2026-05-15).

New files:
- `src/core/workspaceStatusTypes.ts` — shared types (extracted to avoid circular import)
- `src/core/suggestedActions.ts` — 5-rule engine (rules 1-5 + default; full 15-rule set in v3.3)
- `src/core/workspaceStatus.ts` — status scanner with inline subagent aggregate counts
- `src/commands/showWorkspaceStatus.ts` — opens unsaved markdown tab; emits telemetry

Updated files:
- `src/extension.ts` — registers `witness.showWorkspaceStatus` (18 commands total)
- `package.json` — adds activation event and contributes.commands entry
- `docs/v3-implementation-plan.md` — this status annotation

Design decisions resolved in v3.1:
- Types extracted to `workspaceStatusTypes.ts` to prevent circular import.
- No caching; status computed fresh on each command invocation.
- Inline subagent scan in `workspaceStatus.ts`; `subagentHealth.ts` deferred to v3.2.
- Output: unsaved markdown editor tab (not output channel).
- No status bar in v3.1.

### v3.2 — Subagent Health Monitor

**Status**: Implemented and compile-validated (2026-05-15).

New files:
- `src/core/subagentHealth.ts` — `SubagentHealthLevel`, `SubagentHealthRecord`,
  `SubagentHealthSummary`, `computeSubagentHealth`, `emptySubagentHealthSummary`.
  Classifies both v1 flat files and v2 ledger entries using five prioritized rules.
  All blocking/failed detection uses anchored regex only.

Updated files:
- `src/core/workspaceStatusTypes.ts` — imports `SubagentHealthSummary`; adds
  `subagentHealthSummary` field to `WitnessWorkspaceStatus`.
- `src/core/workspaceStatus.ts` — removes inline v3.1 subagent scan; delegates to
  `computeSubagentHealth`; derives three aggregate count fields from the summary.
- `src/commands/showWorkspaceStatus.ts` — adds `## Subagent Health Details` section
  with per-entry markdown table; removes unused `getWitnessRoot` import; adds six
  subagent count attributes to the telemetry event.
- `docs/v3-implementation-plan.md` — this status annotation.

Design decisions resolved in v3.2:
- `subagentHealthSummary` added as a required (not optional) field on
  `WitnessWorkspaceStatus` to ensure the formatter always has per-entry data.
- `emptySubagentHealthSummary()` exported as a convenience constructor for the
  fallback path in `computeWorkspaceStatus` and for future test fixtures.
- `incompleteSubagentLedgers` maps to `incompleteCount + loopRiskCount` so that
  loop-risk entries (stale evidence, no report) appear in the incomplete aggregate
  seen by `suggestedActions.ts`.

### v3.3 — Suggested Actions Engine (full rule set)

Complete `src/core/suggestedActions.ts` with all 15 rules. Wire into `computeWorkspaceStatus`.
Update `showWorkspaceStatus.ts` to present the full suggested action with severity label.
Compile. Run fixture tests for each rule. Update this document.

### v3.4 — Status Bar Assistant

Implement `src/core/statusBar.ts`. Register on activation in `extension.ts`. Wire update
triggers (post-command hook, file save listener). Compile. Run manual smoke tests. Update this
document.

### v3.5 — Guided Workflow Commands

Implement `checkpointNow.ts`, `prepareSessionSwitch.ts`, `resumeSession.ts`. Register all three.
Update `commands.md` template. Compile. Run manual walkthroughs of each command sequence. Run
v2 regression check. Update this document.

### v3.6 — Evaluation Summary

Implement `src/core/evaluationSummary.ts` and `src/commands/generateEvaluationSummary.ts`.
Register command. Compile. Run evaluation summary check against a prepared session. Update this
document.

### v3.7 — Docs and Regression Update

Update `README.md` (add v3 commands, status bar section, guided workflow section).
Update `docs/architecture.md` (add v3 continuity layer diagram and module descriptions).
Update `docs/workflow.md` (reference guided workflow commands).
Create `docs/v3-validation-report.md` (structured validation report following the v2 pattern).
Run full v2 regression check one final time. Compile. Tag v3.

---

## 15. Open Design Questions

The following questions are recorded for resolution before or during implementation. They do not
block plan acceptance but must be resolved before the affected milestone begins.

**Q1. Presentation surface for `Witness: Show Workspace Status`.**
The command can write its output to (a) an unsaved markdown editor tab, (b) a dedicated Witness
output channel (`vscode.window.createOutputChannel`), or (c) the existing output channel if v2
already creates one. An editor tab is readable but adds to the open editor set. An output channel
is persistent but less readable for structured markdown. A hybrid approach (output channel for
machine-readable text, editor tab for human-readable markdown) adds complexity. Resolution needed
before v3.1 begins.

**Q2. Whether `computeWorkspaceStatus` should cache its result.**
If the status bar and the `Show Workspace Status` command both consume `computeWorkspaceStatus`,
two calls in rapid succession would perform redundant filesystem reads. A module-level cache with
a time-to-live (e.g., 10 seconds) would prevent this but introduces stale-state risk. Given that
scans are triggered by discrete events (command completion, file save), a simple per-trigger
compute without caching may be sufficient. Resolution needed before v3.4 (status bar) begins.

**Q3. Stale threshold configurability.**
The thresholds defined in Section 8 (`STALE_CURRENT_STATE_MINUTES`, `STALE_HANDOVER_MINUTES`,
`LOOP_RISK_EVIDENCE_MINUTES`) are currently fixed constants. Making them configurable via VS Code
settings (`witness.staleThresholds.*`) would require adding `configuration` to `package.json`
`contributes`, which is a `package.json` change. v3.0 defers this; the question is whether the
first user-visible build of v3 should include settings or launch with fixed thresholds and add
settings later.

**Q4. Status bar item placement and color theming.**
VS Code status bar items can be placed at the left or right. Right placement (lower priority, less
prominent) is proposed. The color for `warning` and `critical` states uses VS Code's built-in
`statusBarItem.warningBackground` and `statusBarItem.errorBackground` theme colors. If neither
color is sufficient for the intended severity gradient, a custom color contribution is needed,
which requires a `package.json` change. The severity model should be confirmed against the
available VS Code status bar theming API before v3.4 begins.

**Q5. Subagent health reading for status field extraction.**
The `blocked` health level requires detecting the string `blocked` or `failed` in a report or
evidence file. The classification rule can be applied as a simple `readFile` + `includes` check
on the first N bytes of the file, or as a more robust regex over a header section. The robustness
tradeoff: simple `includes` may produce false positives (e.g., a `## Known Blockers` section that
mentions the word `blocked` in prose). A regex anchored to a `Status:` field is more precise.
Resolution needed before v3.2 begins.

**Q6. Evaluation summary attribution of subagent entries to the active session.**
The evaluation summary reports subagent entries "attributed to this session." Attribution is
determined by reading `contract.md` and checking the `Session:` header field. This requires
reading the first few lines of each `contract.md`. For workspaces with many subagent entries, this
adds proportional read overhead. An alternative is to report all subagent entries regardless of
session, with a note that cross-session attribution is not filtered. Resolution needed before v3.6
begins.

**Q7. Guided workflow cancellation recovery.**
If the developer cancels mid-way through `Witness: Prepare Session Switch` (e.g., after generating
the handover but before validating it), the partial state (a new `latest.md` exists, but no
validation report) is left in `.witness/`. This is not harmful, but the developer may be unaware
that the handover is unvalidated. The command currently shows a warning and offers to continue.
An alternative is to show a summary of completed and skipped steps at the end of any partial
execution, so the developer knows exactly what was and was not done.

---

## Document Status

This document is the authoritative v3 implementation plan. v3.1 through v3.6 are fully
implemented and compile-validated. The UX principle is locked. v3 is closed.

---

## Next Phase Candidates

These items are identified future scope. They are not committed. No implementation work begins
without a new plan document and explicit acceptance.

---

### Candidate: Witness: Resolve Continuity Issue

**Proposed command ID**: `witness.resolveContinuityIssue`
(alternative name: `witness.resolveSubagentIssue` if scope is narrowed to subagent-only)

**Problem it solves**: When the status bar shows a warning (e.g., `Witness: Review Needed` or
`Witness: Subagent Blocked`), the developer must know which command to run, then navigate to
the right artifact, then decide what to do. The guided resolver collapses these three steps.

**Proposed behavior**:

1. The status bar detects the top-priority issue from the suggested actions engine.
2. The developer clicks the status bar item and selects "Resolve issue" from the QuickPick.
3. Witness opens the relevant artifact (e.g., the pending ledger entry's `evidence.md` or the
   unvalidated handover).
4. The developer reviews the artifact in the editor.
5. A follow-up QuickPick offers: Accept / Accept with Conditions / Reject / Create Follow-Up Task.
6. Witness writes the appropriate next stage file (e.g., `review.md`) with the chosen decision.

**Design constraints (non-negotiable)**:
- Witness does not decide or execute autonomously.
- The developer must explicitly choose the resolution action at step 5.
- The written artifact is a normal stage file — no new artifact type or format.
- No LLM calls. The resolution is entirely artifact-based.
- The command does not switch the active session.
- The command does not modify any artifact the developer has not reviewed.

**Scope boundary**:
This command is a navigation and scaffolding helper, not a decision-making agent. It opens the
right file and writes the decision the developer selects — nothing more.

**Why it is deferred**:
- The QuickPick resolution mapping requires per-issue-type logic (subagent vs. handover vs.
  stale artifact vs. context packet missing) that adds significant conditional branching.
- The user experience needs design work: what does "Resolve" mean for a stale handover vs. a
  blocked subagent vs. a missing context packet? These are different artifacts and different
  workflows.
- v3 closes with the status bar surfacing the issue. Resolution remains a developer-driven
  command sequence using the existing command set.
