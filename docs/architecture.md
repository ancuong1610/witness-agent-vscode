# Witness Agent — Architecture

This document describes the architecture of the Witness Agent VS Code extension. It covers the
high-level component model, the artifact system, the v2 layer additions, the five continuity-risk
dimensions, the five risk levels, the default read set rule, and the separation of concerns between
coding agents, Witness Agent, and the builder.

---

## High-Level Architecture

Witness Agent is a VS Code background continuity layer. It monitors the project's `.witness/`
state, detects continuity risks and subagent issues, and quietly suggests the next safe action via
the status bar. The developer continues coding normally and only interacts with Witness when a
checkpoint, review, or session transition is needed.

It does not generate code, intercept Copilot completions, or communicate with any AI backend. It
provides a command palette interface and a status bar assistant for recording and reviewing
structured continuity artifacts in a workspace-local directory (`.witness/`).

**Locked UX principle**: Witness should reduce continuity workload, not create new workflow workload.

**The automatic/confirmed boundary**:

| Automatic (no confirmation) | Confirmed (developer must act) |
|-----------------------------|-------------------------------|
| Observe `.witness/` file ages | Write any artifact |
| Classify workspace status | Review subagent work |
| Warn via status bar | Compress current state |
| Suggest next safe action | Generate handover |
| | Prepare session switch |
| | Start new session |

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Developer's workspace                               │
│                                                                                │
│  ┌─────────────────┐                          ┌───────────────────────────┐   │
│  │  Coding Agent   │ ←── developer loads ───  │     Witness Agent         │   │
│  │ (Copilot, etc.) │     .witness/ files       │     (VS Code ext)         │   │
│  └─────────────────┘     into chat context     └──────────┬────────────────┘  │
│                                                            │                   │
│                                                  vscode.workspace.fs           │
│                                                            │                   │
│                                              ┌─────────────▼──────────────┐   │
│                                              │         .witness/            │   │
│                                              │   ┌──────────────────────┐  │   │
│                                              │   │ Source-of-truth layer│  │   │
│                                              │   ├──────────────────────┤  │   │
│                                              │   │  Telemetry layer     │  │   │
│                                              │   ├──────────────────────┤  │   │
│                                              │   │  Workflow harness    │  │   │
│                                              │   └──────────────────────┘  │   │
│                                              └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘

Builder (Claude Code) — external to the above diagram — built the extension itself.
Not present at runtime.
```

The key architectural principle: Witness Agent writes to `.witness/`; the coding agent reads from
it when the developer loads those files into context. There is no API between them. All coupling
is through the filesystem.

---

## The Three Layers Inside `.witness/`

Both the source-of-truth layer and the telemetry layer live under `.witness/`. They serve
different purposes and should not be conflated.

### Layer 1 — Continuity Source-of-Truth

Purpose: give the coding agent the minimum reliable project context needed to resume work. These
artifacts are intended for selective, purposeful loading into agent context.

| Path | Role |
|------|------|
| `.witness/index.md` | Directory map and default read set guide |
| `.witness/current-state.md` | Single source of truth for current project state |
| `.witness/constitution.md` | Continuity rules, risk vocabulary, behavioral contracts |
| `.witness/commands.md` | Command palette cheat sheet |
| `.witness/decisions/` | Architectural Decision Records (ADRs) |
| `.witness/sessions/` | Per-session records, risk files, observations, context packets |
| `.witness/handovers/` | Validated handover documents and `latest.md` |
| `.witness/evaluation/` | Resume probe results and validation reports |
| `.witness/templates/` | Blank templates for runtime use |
| `.witness/subagents/` | Subagent invocation records (v1 flat) and ledger directories (v2) |

### Layer 2 — Telemetry and Evaluation

Purpose: collect structured local telemetry for tracing command execution, continuity risk signals,
and observable context degradation. This layer is for developer analysis, not for loading into
agent context.

| Path | Role |
|------|------|
| `.witness/telemetry/` | Session-scoped context pressure snapshots |
| `.witness/telemetry/otel/events.jsonl` | Local OTel-style structured JSONL event log |

As of v2.2, all 17 Witness Agent commands emit structured events to `events.jsonl` on every
execution. Each record includes: timestamp, event name, command ID, session ID, status, duration,
workspace-relative artifact paths, and command-specific attributes. No prompt text, file contents,
or chat transcripts are written. The telemetry file is not part of the default fresh-session read
set.

### Layer 3 — Workflow Harness

Purpose: provide templates and guidance for developers and coding agents operating within the
Witness workflow.

| Path | Role |
|------|------|
| `.witness/commands.md` | Command palette cheat sheet |
| `.witness/templates/` | Blank templates for sessions, ADRs, handovers, subagent stages, context packets |
| `.witness/AGENTS.md` | Agent entry point — default read set, constraints, harness index (v4.6) |
| `.witness/harness/agent-resume.md` | Resume protocol for primary coding agents (v4.6) |
| `.witness/harness/subagent-task.md` | Task protocol for coding agents acting as subagents (v4.6) |
| `.witness/harness/continuity-issue.md` | Protocol for non-clear Witness status (v4.6) |
| `.witness/harness/session-switch.md` | Protocol for preparing and resuming across sessions (v4.6) |
| `.witness/harness/orchestrator.md` | Orchestrator protocol: progressive ledger levels, delegation checklist, failure policy (v4.7) |

The v4.6 Agent Harness Pack files are agent-readable instructions. Coding agents can use them
when the developer loads or references them. They do not integrate with any coding agent API and
do not grant agents autonomous write, review, or approval capabilities.

---

## Extension Source Structure (v4)

```
src/
├── extension.ts                    — Entry point: activate() registers all 23 public commands
│                                     + 1 internal status bar command (witness.openStatusActions)
├── commands/
│   ├── initProject.ts              — witness.initProject
│   ├── startSession.ts             — witness.startSession
│   ├── recordContext.ts            — witness.recordContext
│   ├── observeWorkspace.ts         — witness.observeWorkspace
│   ├── createADR.ts                — witness.createADR
│   ├── recordSubagent.ts           — witness.recordSubagent (v1 flat model)
│   ├── assessRisk.ts               — witness.assessRisk
│   ├── generateHandover.ts         — witness.generateHandover
│   ├── validateHandover.ts         — witness.validateHandover
│   ├── createResumeProbe.ts        — witness.createResumeProbe
│   ├── compressState.ts            — witness.compressState
│   ├── startSubagentTask.ts        — witness.startSubagentTask (v2 ledger)
│   ├── createSubagentContextPacket.ts — witness.createSubagentContextPacket (v2 ledger)
│   ├── recordSubagentEvidence.ts   — witness.recordSubagentEvidence (v2 ledger)
│   ├── completeSubagentTask.ts     — witness.completeSubagentTask (v2 ledger)
│   ├── reviewSubagentTask.ts       — witness.reviewSubagentTask (v2 ledger)
│   ├── createContextPacket.ts      — witness.createContextPacket (session-level)
│   ├── showWorkspaceStatus.ts      — witness.showWorkspaceStatus (v3.1)
│   ├── checkpointNow.ts            — witness.checkpointNow (v3.5)
│   ├── prepareSessionSwitch.ts     — witness.prepareSessionSwitch (v3.5)
│   ├── resumeSession.ts            — witness.resumeSession (v3.5)
│   ├── generateEvaluationSummary.ts — witness.generateEvaluationSummary (v3.6)
│   └── resolveContinuityIssue.ts   — witness.resolveContinuityIssue (v4.2)
└── core/
    ├── witnessPaths.ts             — URI helpers, WITNESS_SUBDIRS constant
    ├── artifactWriter.ts           — ensureDir, writeFileIfMissing, writeGitkeep, readFile
    ├── templates.ts                — loadTemplate(), TEMPLATE_FILES, ROOT_DOC_FILES
    ├── sessionRegistry.ts          — getCurrentSessionId, setCurrentSessionId, generateNewSessionId
    ├── handoverGenerator.ts        — gatherArtifactRefs, generateHandoverContent, nextHandoverOrdinal
    ├── riskEngine.ts               — RISK_DIMENSIONS, computeOverall, risk level logic
    ├── subagentLedger.ts           — SubagentLedgerEntry, path helpers, ordinal computation,
    │                                 listSubagentLedgerEntries, filter helpers
    ├── telemetryWriter.ts          — emitWitnessEvent, createCommandTimer, toRelativeWitnessPath,
    │                                 WitnessTelemetryEvent, WitnessTelemetryStatus
    ├── time.ts                     — formatLocalDate, formatLocalTimestamp (local-timezone helpers)
    ├── workspaceStatus.ts          — computeWorkspaceStatus, WitnessWorkspaceStatus (v3.1)
    ├── subagentHealth.ts           — computeSubagentHealth, SubagentHealthSummary (v3.2)
    ├── suggestedActions.ts         — computeSuggestedAction, 15-rule priority engine (v3.3)
    ├── statusBar.ts                — initializeWitnessStatusBar, refreshWitnessStatusBar (v3.4/v4.3)
    │                                 registers internal witness.openStatusActions command;
    │                                 v4.3: first QuickPick item is resolver item when not all-clear
    ├── evaluationSummary.ts        — generateEvaluationSummary, EvaluationSummaryResult (v3.6)
    └── continuityResolver.ts       — resolveTopIssue, ContinuityResolutionPlan (v4.1/v4.4)
                                      maps suggestedAction.id → ContinuityIssueKind → plan;
                                      never reads suggestedAction.commandId (Q7, locked)

src/templates/
├── constitution.md
├── index.md
├── current-state.md
├── commands.md
├── AGENTS.md                             (v4.6 — copied to .witness/AGENTS.md)
├── session-template.md
├── context-pressure-template.md
├── subagent-report-template.md
├── adr-template.md
├── handover-template.md
├── resume-probe-template.md
├── subagent-contract-template.md         (v2.3)
├── subagent-context-packet-template.md   (v2.3)
├── subagent-evidence-template.md         (v2.3)
├── subagent-completion-report-template.md (v2.3)
├── subagent-review-template.md           (v2.3)
├── context-packet-template.md            (v2.5)
└── harness/                              (v4.6/v4.7 — copied to .witness/harness/)
    ├── agent-resume.md
    ├── subagent-task.md
    ├── continuity-issue.md
    ├── session-switch.md
    └── orchestrator.md                   (v4.7)
```

---

## The Artifact System (v2)

After running `Witness: Initialize Project`, the workspace contains:

```
.witness/
├── constitution.md
├── index.md
├── current-state.md
├── commands.md
├── templates/
│   ├── session-template.md
│   ├── context-pressure-template.md
│   ├── subagent-report-template.md
│   ├── adr-template.md
│   ├── handover-template.md
│   ├── resume-probe-template.md
│   ├── subagent-contract-template.md
│   ├── subagent-context-packet-template.md
│   ├── subagent-evidence-template.md
│   ├── subagent-completion-report-template.md
│   ├── subagent-review-template.md
│   └── context-packet-template.md
├── AGENTS.md                  — agent entry point (v4.6 Agent Harness Pack)
├── harness/                   — agent protocol files (v4.6/v4.7 Agent Harness Pack)
│   ├── agent-resume.md
│   ├── subagent-task.md
│   ├── continuity-issue.md
│   ├── session-switch.md
│   └── orchestrator.md        — orchestrator protocol (v4.7)
├── sessions/                  — per-session files, risk files, observations, context packets
├── telemetry/                 — session-scoped pressure snapshots + otel/ event log
│   └── otel/
│       └── events.jsonl       — structured JSONL event stream (created on first command execution)
├── subagents/                 — v1 flat files (subagent-NNN.md) + v2 ledger dirs (subagent-NNN/)
├── decisions/                 — ADRs
├── handovers/                 — handover files + latest.md
└── evaluation/                — validation reports + resume probes
```

Each top-level directory is seeded with a `.gitkeep` file at initialization so empty directories
are tracked by git.

---

## The Subagent Ledger (v2)

The v2 Subagent Ledger models the full lifecycle of a delegated subagent task. Each entry is a
directory under `.witness/subagents/subagent-NNN/` containing up to five stage files:

| Stage File | Written By | Purpose |
|------------|-----------|---------|
| `contract.md` | `Witness: Start Subagent Task` | Task goal and acceptance criteria |
| `context-packet.md` | `Witness: Create Subagent Context Packet` | Context assembled before dispatch |
| `evidence.md` | `Witness: Record Subagent Evidence` | Execution record after completion |
| `report.md` | `Witness: Complete Subagent Task` | Outcomes vs acceptance criteria |
| `review.md` | `Witness: Review Subagent Task` | Integration decision and record |

The ordinal counter spans both v1 flat files and v2 ledger directories so numbers are never
reused. `src/core/subagentLedger.ts` provides all path helpers, ordinal computation, entry
listing, and filter utilities.

---

## The Session Context Packet (v2.5)

`Witness: Create Context Packet` produces a reviewed context packet at:

```
.witness/sessions/<session-id>-context-packet-NNN.md
```

The packet inlines `current-state.md` and `handovers/latest.md`, and includes reference paths
(not inlined content) for the latest risk assessment, latest workspace observation, ADRs
referenced in the handover, and subagent entries linked to the session. The developer reviews
the packet before using it to initialize a fresh agent session. A mandatory marker scan warns
if unfilled placeholders remain in the inlined sources.

Context packets are not automatically injected into agent sessions. The developer loads them
manually and selectively.

---

## The Local Telemetry Writer (v2.1–v2.2)

`src/core/telemetryWriter.ts` provides:

- `emitWitnessEvent(params)` — appends a single JSONL record to `events.jsonl`. Fire-and-forget;
  never throws. Creates the `otel/` directory and file if absent.
- `createCommandTimer()` — returns an `elapsed()` function measuring milliseconds since call.
- `toRelativeWitnessPath(workspaceRoot, uri)` — converts an absolute URI to a workspace-relative
  forward-slash string for use in `artifact_paths`.

Every command calls `createCommandTimer()` before its try block and `emitWitnessEvent()` at each
cancel, error, and success path. The catch block re-fetches `getWorkspaceRoot()` since the
workspace root variable is scoped inside the try block.

Privacy invariants enforced in every event:
- No prompt text
- No file contents
- No chat transcripts
- No absolute paths (only workspace-relative paths)
- Only metadata: counts, ordinals, booleans, durations, status strings

---

## The Five Continuity-Risk Dimensions

Risk is never a single number. Witness Agent evaluates continuity risk across five independent
dimensions, each of which can independently elevate or reduce the overall risk posture.

### 1. Active Context Pressure

Measures how full the current session's context window is. As pressure increases, the model has
less room to reason and may silently drop earlier context. Pressure is a developer-estimated
percentage. Thresholds: 0-30% LOW, 31-55% MEDIUM, 56-75% HIGH, 76-90% VERY HIGH, 91-100% CRITICAL.

Pressure is a gauge, not a rot score. A session can be high-pressure with current context, or
low-pressure with stale context. Other dimensions cover the latter.

### 2. Artifact Externalization Gap

Compares what happened in the session against what has been persisted to `.witness/`. Examples:
decisions made in chat but not written to an ADR; files changed but not documented; handover older
than the most recent meaningful change; `current-state.md` that no longer reflects reality.

The gap widens silently during a session and only becomes a problem at the next session boundary.

### 3. Subagent Boundary Risk

Each subagent invocation is a boundary at which context can be lost. Risk examples: a subagent
was used but no record exists; the subagent changed files not listed anywhere; the subagent's
output was accepted without verification. The v2 Subagent Ledger is the structured response to
this dimension.

### 4. Quality Drift

Observable signals that the AI session is becoming less reliable: repeated corrections of the same
kind of mistake; wrong file location assumptions; direct contradictions with the spec or plan;
hallucinated completed actions. When drift signals accumulate, the cost of continuing rises relative
to the cost of generating a handover and starting fresh.

### 5. Phase Boundary Risk

Workflow transitions are natural checkpoints: specify to plan, plan to tasks, tasks to
implementation, implementation to validation, validation to release, one vertical slice to the next.
At each boundary the session's working context is most likely to be partially discarded.

---

## The Five Risk Levels

| Level | Meaning |
|-------|---------|
| GREEN | Low risk across all dimensions. Safe to continue or start a fresh session. |
| YELLOW | One dimension is elevated but manageable. Note the factor and continue with awareness. |
| ORANGE | Two or more dimensions are stressed, or one is severely elevated. Consider a checkpoint. |
| RED | High risk. Generate a validated handover before ending the session. |
| BLOCKED | Critical condition. Resolve the specific blocker before continuing. |

High risk does not mean stop immediately. It means: generate a validated handover before the next
session boundary. BLOCKED is different — a specific condition makes it unsafe to continue without
first resolving that condition.

---

## The Default Read Set Rule

When starting a fresh coding agent session, load exactly these files before doing any work:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

Pull optional context only when a task specifically requires it: relevant ADRs, specific subagent
ledger entries, or a reviewed context packet assembled with `Witness: Create Context Packet`.

Do not front-load session histories, raw telemetry, the full ADR archive, or all subagent
evidence. These are reference material to be pulled on demand as specific questions arise.

---

## Separation of Roles

| Entity | Role | Runs Where |
|--------|------|------------|
| Coding agent (Copilot, Claude Code, etc.) | AI coding — generates code, executes tasks | Inside VS Code / external terminal |
| Witness Agent | Continuity recorder — maintains `.witness/`, assesses risk, generates handovers | Inside VS Code, as a separate extension |
| Builder (Claude Code) | Built the Witness Agent extension during the Agent Witness project | External to VS Code; not present at extension runtime |

Witness Agent runs beside the coding agent. It does not talk to it, intercept its output, or
modify its behavior. The relationship is entirely mediated by `.witness/`: Witness writes to it;
the coding agent reads from it when the developer loads those files into context.

---

## The v3 Background Continuity Layer

v3 adds a background continuity layer on top of the v1/v2 artifact model. This layer runs
continuously (on workspace open, on `.witness/` file save, on workspace folder change) and
surfaces guidance without requiring the developer to run commands manually.

### Component overview

| Component | Module | Responsibility |
|-----------|--------|----------------|
| Workspace scanner | `src/core/workspaceStatus.ts` | Reads artifact ages, active session, handover state, context packet state, risk level |
| Subagent health scanner | `src/core/subagentHealth.ts` | Reads ledger directories, classifies each entry by lifecycle completeness |
| Suggested actions engine | `src/core/suggestedActions.ts` | 15-rule first-match priority table; returns one `SuggestedAction` per scan |
| Status bar assistant | `src/core/statusBar.ts` | Debounced file-save listener; updates status bar item label and color; QuickPick on click |
| Evaluation summary | `src/core/evaluationSummary.ts` | Aggregates all session artifact counts into a markdown report |

### The 15-rule priority table

Rules fire in order; first match wins. The engine is synchronous and deterministic — no LLM calls.
Thresholds: current-state stale = 120 min; handover stale = 180 min.

1.  No `.witness/` project — suggest `witness.initProject` (warning)
2.  No active session — suggest `witness.startSession` (warning)
3.  Blocked or failed subagent exists — suggest `witness.showWorkspaceStatus` (critical)
4.  Risk RED or BLOCKED and handover absent or stale — suggest `witness.generateHandover` (critical)
5.  Risk ORANGE and handover absent or stale — suggest `witness.generateHandover` (warning)
6.  Pending subagent reviews > 0 — suggest `witness.reviewSubagentTask` (warning)
7.  Loop-risk subagents > 0 (stale evidence, no report) — suggest `witness.showWorkspaceStatus` (warning)
8.  Incomplete subagent ledgers > 0 — suggest `witness.showWorkspaceStatus` (warning)
9.  Current-state exists and is stale (> 120 min) — suggest `witness.compressState` (warning)
10. Current-state missing — suggest witness.showWorkspaceStatus or restore/init carefully
11. Latest handover exists but no context packet assembled — suggest `witness.createContextPacket` (info)
12. Latest handover exists and is stale (> 180 min) — suggest `witness.generateHandover` (warning)
13. Latest context packet has mandatory markers — suggest `witness.createContextPacket` (warning)
14. Telemetry events file absent — suggest `witness.observeWorkspace` (info)
15. Default all-clear — no action needed (info)

### Status bar label mapping

| Workspace state | Label | Color |
|-----------------|-------|-------|
| No `.witness/` project | `Witness: Setup Needed` | warning |
| No active session | `Witness: No Session` | warning |
| RED/BLOCKED risk | `Witness: Risk Critical` | error |
| Pending reviews or loop risk | `Witness: Review Needed` | warning |
| Blocked/failed subagents | `Witness: Subagent Blocked` | warning |
| Stale artifacts | `Witness: Stale Artifacts` | warning |
| All-clear | `Witness: OK` | default |

### Status bar QuickPick behavior

Clicking the status bar item opens a QuickPick. The first item is always the current suggested
action. The remaining items are shortcuts to existing commands. Selecting an item executes the
corresponding command via `vscode.commands.executeCommand`. No new workflow is created — the
QuickPick is navigation sugar, not a new artifact write path.

---

## The v4 Continuity Issue Resolver

v4 adds a resolver layer that translates the top-priority issue from the background status
scanner into a developer-readable explanation and a guided action QuickPick. It is the bridge
between passive status bar observation (v3) and concrete artifact action.

### Resolver flow

```
.witness/ artifacts
    │
    ▼
computeWorkspaceStatus()          — workspaceStatus.ts: reads artifact ages, session, health
    │
    ▼
WitnessWorkspaceStatus
    │
    ▼
selectSuggestedAction()           — suggestedActions.ts: 15-rule priority engine
    │
    ▼
suggestedAction.id                — string id only; commandId never forwarded (Q7 lock)
    │
    ▼
resolveTopIssue()                 — continuityResolver.ts: synchronous, no I/O, no LLM
    │
    ▼
ContinuityResolutionPlan          — whatHappened / whyItMatters / whatToDoNext / evidence
    │
    ▼
formatResolverPreview()           — resolveContinuityIssue.ts: markdown document
    │
    ▼
openTextDocument (unsaved tab)    — developer reads the explanation
    │
    ▼
showQuickPick (action list)       — developer selects an action
    │
    ▼
executeCommand (existing command) — all writes route through existing confirmed commands
```

### Key modules

| Module | Role |
|--------|------|
| `src/core/continuityResolver.ts` | Synchronous resolver core. Maps issue kind to a fully populated plan. No filesystem reads. No LLM calls. |
| `src/commands/resolveContinuityIssue.ts` | Public command. Opens markdown preview, opens artifact files, presents QuickPick. Emits `witness.continuity_issue.resolved`. |
| `src/core/statusBar.ts` (v4.3) | `buildResolverItem()` prepends a `Resolve:` / `Address:` item to the status bar QuickPick when suggested action is not all-clear. |
| `package.json` (hotfix) | `workspaceContains:.witness/index.md` activation event added. Extension activates automatically in initialized workspaces. |

### Design invariants

- `resolveTopIssue` uses `suggestedAction.id` only for classification. It does not read or
  forward `suggestedAction.commandId`. All resolver actions come from the issue-specific plan
  builders inside `continuityResolver.ts` (Q7, locked v4.1).
- No autonomous writes. No session switching. No context injection.
- All writes route through existing confirmed commands after the developer selects an action.
- Resolver telemetry (`witness.continuity_issue.resolved`) is emitted only by the command, not
  by the resolver core or status bar.

### Subagent-focused navigation (v4.4)

For the four subagent issue kinds (`blocked-subagent`, `pending-subagent-review`,
`loop-risk-subagent`, `incomplete-subagent-ledger`), the resolver inspects
`status.subagentHealthSummary.entries` to select the first affected entry by lowest ordinal.

Per-entry improvements:
- `whatHappened` names the specific entry id (e.g. `subagent-004 is blocked or failed.`)
- `artifactPaths` lists present stage files as workspace-relative file paths, not the directory
- `incomplete-subagent-ledger` primary action is stage-aware: `evidence.md` missing →
  `witness.recordSubagentEvidence`; `report.md` missing → `witness.completeSubagentTask`;
  `review.md` missing → `witness.reviewSubagentTask`; otherwise → `witness.showWorkspaceStatus`

### Activation hotfix

`package.json` `activationEvents` includes `workspaceContains:.witness/index.md`.
This causes VS Code to activate the extension — and therefore initialize the status bar — when
the user opens a workspace that already has `.witness/index.md`. No manual command is needed.
Non-Witness workspaces are unaffected.

Current counts: 23 public commands, 24 activation events, 1 internal status bar command
(`witness.openStatusActions`, not in `package.json` contributes).

---

## The v4.6 Agent Harness Pack

v4.6 adds the Agent Harness Pack: a set of agent-readable protocol files that tell coding agents
how to consume `.witness/` artifacts safely. The pack is created during `Witness: Initialize
Project` alongside the existing templates.

### Files created

| Runtime path | Source template | Purpose |
|---|---|---|
| `.witness/AGENTS.md` | `src/templates/AGENTS.md` | Top-level entry point; default read set, constraints, harness index |
| `.witness/harness/agent-resume.md` | `src/templates/harness/agent-resume.md` | Protocol for resuming a project (v4.6) |
| `.witness/harness/subagent-task.md` | `src/templates/harness/subagent-task.md` | Protocol for agents acting as subagents (v4.6) |
| `.witness/harness/continuity-issue.md` | `src/templates/harness/continuity-issue.md` | Protocol for non-clear Witness status (v4.6) |
| `.witness/harness/session-switch.md` | `src/templates/harness/session-switch.md` | Protocol for preparing and resuming across session boundaries (v4.6) |
| `.witness/harness/orchestrator.md` | `src/templates/harness/orchestrator.md` | Orchestrator protocol: progressive ledger levels, delegation checklist, failure policy (v4.7) |

### Implementation

No new public commands. The only source changes are in the initialization path:

- `src/core/witnessPaths.ts` — `'harness'` added to `WITNESS_SUBDIRS` (v4.6)
- `src/core/templates.ts` — `AGENTS_ROOT_FILE`, `HARNESS_TEMPLATE_FILES` (5 entries after v4.7),
  and `loadHarnessTemplate()` added
- `src/commands/initProject.ts` — steps 9 and 10 added: write AGENTS.md, copy harness files
  into `.witness/harness/`; `.gitkeep` sweep updated to exclude `'harness'`

v4.7 adds `'orchestrator.md'` to `HARNESS_TEMPLATE_FILES` (5 entries total). No other source
files change.

Write-if-missing semantics: `writeFileIfMissing` is used for all harness files. Re-running
initialization after files are already present is a no-op for the harness files.

### What the pack does and does not do

The Agent Harness Pack is agent-readable instructions. Coding agents can use these files when
the developer loads or references them. The pack does not:

- Integrate directly with any coding agent API
- Automatically inject context into any coding agent session
- Grant agents autonomous write, review, or approval capabilities
- Add new public commands or change any command's behavior beyond initialization

Commands count: 23 (unchanged). Activation events: 24 (unchanged).

---

## Design Decisions

Key architectural decisions are recorded as ADRs in `.witness/decisions/` once the project is
initialized. Implementation plans for each version record rationale for design choices:
- `docs/v2-implementation-plan.md` — v2 telemetry, subagent ledger, context packet
- `docs/v3-implementation-plan.md` — v3 background layer, UX principle, rule engine
- `docs/v4-implementation-plan.md` — v4 resolver, status bar integration, activation hotfix, v4.6 harness
- `docs/product-ux-principles.md` — locked UX principles and automatic/confirmed boundary
