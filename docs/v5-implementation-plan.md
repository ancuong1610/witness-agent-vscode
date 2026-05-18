# Witness Agent v5 Implementation Plan

**Theme:** Seamless Onboarding + Guided Minimal Workflow
**Status:** Planning only. Do not implement source code. Do not modify package.json. Do not add commands. Do not modify extension.ts. Do not add dependencies.
**Date:** 2026-05-18

---

## 1. v5 Summary

### Where Witness Has Been

v1 and v2 established the foundational continuity architecture: session records, checkpoint files, handover documents, and the `.witness/` directory structure. These releases proved the core hypothesis — that persistent, file-based project memory could give AI coding agents reliable context across context window boundaries.

v3 and v4 deepened the methodology. ADR tracking, context packets, subagent ledgers, risk assessment, resolver flows, and the current-state model were added. By v4 the Witness framework had a coherent, documented protocol for managing multi-session and multi-agent development work.

v4.6 introduced agent harness protocols that help coding agents consume Witness artifacts when the developer references them. Witness does not orchestrate agents directly; it provides structured context files and protocol guidance that a developer can hand to a coding agent. v4.7 followed with the Generic Orchestrator Harness Guide, making these protocols usable with any orchestration approach, not just named harnesses.

At the end of v4.7, Witness had 23 public commands, a complete continuity methodology, harness protocols for multi-agent workflows, and a smoke-tested implementation.

### The Feedback

User feedback after v4.7 is consistent:

> "Witness is powerful, but too hard for new developers."

The product exposes too many concepts too early. New users encounter a command palette with 23 entries, documentation referencing a dozen unfamiliar terms, and no clear starting point. Before they can use the tool, they feel they need to understand the tool.

### What v5 Is

v5 does not add new power. The architecture built in v1 through v4.7 is complete and correct. v5 is a UX compression release. It wraps the existing machinery in a beginner-friendly interface that hides complexity behind a single, progressive workflow.

**The shift:**

From:
> "Here are 23 commands and a continuity framework."

To:
> "Start tracking this task, code normally, and click Witness when it warns you."

Advanced commands remain available. Expert users lose nothing. But a new developer should reach productive use within 5 minutes, without reading full documentation, and without understanding the Witness methodology in advance.

---

## 2. Adoption Problem

### The Current First-Run Experience

A new developer installs Witness and opens the command palette. They see commands for sessions, handovers, context packets, subagent ledgers, risk assessment, ADRs, and evaluation summaries — 23 entries with no clear starting point.

The question this raises immediately is: where do I start?

There is no obvious entry point. Each command implies knowledge the user does not yet have. The documentation that explains the workflow is thorough, but it is long, and reading it feels like a prerequisite rather than an onboarding path.

### Concepts Exposed Too Early

The following concepts currently surface during first use or during documentation onboarding. Each is valid and necessary inside the Witness system. None should be required for a user's first session:

- **session** — ambiguous; sounds like an AI chat session, which it is not
- **checkpoint** — unclear when to use it or what it saves
- **handover** — sounds like something for leaving a job, not ending a coding block
- **ADR** — requires prior knowledge of architecture decision records
- **context packet** — novel term with no obvious analogy
- **subagent ledger** — requires understanding of multi-agent orchestration
- **risk assessment** — implies a formal process
- **resolver** — abstract; "resolve what?"
- **current-state** — ambiguous; could mean project state or AI context
- **AGENTS.md** — requires understanding of the harness protocol
- **harness** — requires understanding of multi-agent orchestration
- **workflow** — overloaded term
- **resume** — unclear resume-what, from-where

The problem is not that these concepts are wrong. The problem is that they are all visible at once, before the user has any context for why they matter.

### The Core Adoption Failure

> "Before I can use the tool, I need to understand the tool."

A developer adopts a tool because it saves them effort. If the adoption process itself requires effort — reading docs, learning terminology, planning a workflow — then many developers will not adopt it, even if the tool would genuinely help them.

v5 must eliminate this barrier. The goal is that a developer can install Witness, run one command, and be immediately productive, with deeper features becoming visible only as they are needed.

---

## 3. Beginner Mental Model

### The One-Sentence Model

> "Witness keeps memory for your AI coding work."

Everything in Witness supports this sentence. Sessions are memory records. Checkpoints save memory. Handovers pass memory between sessions. Context packets carry memory into new agent sessions. ADRs are memory of decisions. The current-state file is the live memory summary.

The beginner does not need to know any of these names. They need to know: Witness remembers things so they do not have to.

### The Six-Step Beginner Flow

A new developer should be able to complete the following steps without reading documentation:

1. **Enable Witness.** Run `Witness: Enable for This Project`. Witness sets itself up in the repository.
2. **Start Tracking This Task.** Run `Witness: Start Tracking This Task`. Answer one question: "What are you working on?" Witness creates a memory record for this work block.
3. **Code normally.** Use any AI coding agent. Witness observes in the background and does not interrupt unless something needs attention.
4. **If Witness warns you, click Resolve Continuity Issue.** When Witness detects a continuity risk, it surfaces a single action. The user clicks it. Witness guides them through the minimum required step.
5. **Before stopping, create a checkpoint or prepare handover.** Run `Witness: Create Checkpoint` before ending a work block. Witness saves current progress to memory.
6. **Next time, Resume with Witness.** Run `Witness: Resume with Witness`. Witness generates a copy-ready prompt for a new AI coding session, pre-loaded with the saved context.

---

## 4. Command Layer Redesign

### Design Principle

v5 introduces a beginner command layer — four commands with plain-language names that serve as the main onboarding path. These commands wrap or alias existing Witness logic; they do not replace it.

Existing advanced commands remain fully functional and unchanged. Documentation will move them to an advanced reference section rather than surfacing them in onboarding guides.

### Beginner Commands

**1. `Witness: Enable for This Project`**

- commandId: `witness.enableProject`
- Wraps or aliases `witness.initProject`
- User-facing wording avoids "initialize" wherever possible
- On success, shows: "Witness is enabled. Run 'Start Tracking This Task' to begin."
- On re-run (already initialized), shows: "Witness is already enabled in this project."

**2. `Witness: Start Tracking This Task`**

- commandId: `witness.startTrackingTask`
- Wraps or reuses `witness.startSession`
- Asks only: "What are you working on?"
- Creates a Witness session using existing session logic
- Stores the task goal in the session record
- Opens or displays a copy-ready coding-agent prompt

**3. `Witness: Create Checkpoint`**

- commandId: `witness.createCheckpoint`
- Beginner wrapper over existing checkpoint behavior
- Guides observation and state update without exposing the risk model first
- Framed as saving progress, not recording a checkpoint or assessing state

**4. `Witness: Resume with Witness`**

- commandId: `witness.resumeWithWitness`
- Opens default read set or latest context packet
- Generates a copy-ready prompt for a new coding-agent session

### Advanced Commands (Unchanged, Reframed in Docs)

The following commands remain available and unchanged. Documentation will move them to an advanced reference section:

- Start Session
- Record Context Snapshot
- Assess Continuity Risk
- Generate Handover
- Create Context Packet
- Subagent Ledger commands
- Evaluation Summary
- ADR commands

---

## 5. Start Tracking This Task UX

This is the most important v5 command. It is the entry point that converts a new install into an active Witness session.

### User Flow

**Step 1.** User runs `Witness: Start Tracking This Task`.

**Step 2.** Witness shows a single input prompt:
> "What are you working on?"

**Step 3.** User enters a short task goal.

Good examples:
- `Implement GitHub OAuth login and update auth tests.`
- `Fix failing workspace status scanner tests.`
- `Validate Witness v4.7 in a fresh workspace.`

Bad examples (Witness should warn or re-prompt):
- `work`
- `continue`
- `fix stuff`
- (empty)

If the input is fewer than 10 characters or matches a short generic string, Witness should respond:
> "A bit more detail helps Witness track your work. Try something like: 'Fix the failing auth tests' or 'Add dark mode to the settings panel.'"

The user may proceed anyway if they choose.

**Step 4.** After input:
- Create a Witness session using existing session logic.
- Store the task goal in the session record.
- Optionally update the current-state starter section if safe and confirmed.
- Open or display a copy-ready coding-agent prompt.

### What a Witness Session Is

A **Witness session** is a repo-local continuity record for one development work block. It is a file or set of files in the `.witness/` directory that records what was worked on, what decisions were made, what risks exist, and what the current state of the work is.

A **coding-agent session** is a conversation with an AI coding tool — a Claude chat, a Copilot context window, a Codex prompt, or any equivalent.

These are not the same thing and they do not have a 1:1 relationship.

A user does not need to start a new coding-agent chat when starting a Witness session. A single Witness session may span multiple coding-agent chats. As a rule of thumb, keep one coding-agent chat aligned with one active Witness work block. If the work block changes, start a new Witness session and tell the coding agent to reload the relevant Witness context.

This distinction must be explicit in all beginner-facing documentation and in-product messaging, because the word "session" is heavily overloaded in developer tooling contexts.

---

## 6. Copy-Ready Coding-Agent Prompts

v5 must generate prompts that users can paste into any AI coding agent. These prompts serve as the bridge between Witness memory and the coding-agent context window.

### Prompt After `Start Tracking This Task`

```text
You are working in this repository with Witness Agent enabled.

First read:
- .witness/index.md
- .witness/current-state.md
- .witness/handovers/latest.md

Current task:
<TASK_GOAL>

Follow .witness/AGENTS.md if available.

Before editing, summarize:
1. current goal
2. relevant constraints
3. open risks or unresolved work
4. next safe step

Do not modify files until you confirm the plan with me.
```

### Prompt After `Resume with Witness`

```text
You are resuming work in this repository with Witness Agent.

First read:
- .witness/index.md
- .witness/current-state.md
- .witness/handovers/latest.md

If a reviewed context packet is provided, use it as the primary resume artifact.

Then summarize:
1. current goal
2. completed work
3. unresolved risks
4. relevant subagent outputs
5. next recommended action

Do not scan all .witness files by default.
Do not read raw telemetry unless explicitly asked.
Do not modify files until you confirm the plan with me.
```

### Where Prompts Are Shown

The preferred display mechanism for copy-ready prompts is:

- An unsaved markdown editor tab, labeled `Witness: Copy This Prompt`, so the user can read the full prompt in a familiar surface. Plain markdown tabs do not support embedded action buttons, so the copy action is delivered separately.
- Immediately after the tab opens, Witness shows a VS Code notification with a single action: `Copy Prompt`. Clicking it copies the full prompt text to the clipboard. Alternatively, the copy action can be offered as a QuickPick item: `Copy Prompt to Clipboard`.
- A QuickPick fallback remains accessible from the status bar action menu for users who have dismissed the notification.

No webview is required for this surface. No automatic injection into Copilot, Claude, Codex, or any other coding agent. The user pastes the prompt manually.

### Prompt Freshness

Prompts reference `.witness/` files by path. The files themselves are the source of truth. The prompt instructs the agent to read them rather than embedding their content. This means prompts do not go stale as session files are updated, and the same prompt template can be reused across sessions with different underlying content.

---

## 7. Status Bar Beginner Behavior

The status bar remains the primary Witness surface. v5 should simplify what users see when they interact with it.

### Beginner-Safe Labels

The status bar item should display simple, readable labels:

- `Witness: OK` — session active, no issues detected
- `Witness: Checkpoint` — Witness recommends creating a checkpoint
- `Witness: Review Needed` — a continuity issue requires user attention
- `Witness: Attention` — a stronger signal; something should be resolved before continuing
- `Witness: No Session` — no active Witness session in this workspace

Labels should not expose internal scoring or risk dimension terminology.

### Click Behavior

When the user clicks the status bar item, the QuickPick menu should be structured so that:

- The first item is always the beginner-safe next action for the current state (for example: "Resolve Continuity Issue", "Create Checkpoint", or "Start Tracking This Task").
- Advanced commands do not appear in the top section.
- Advanced commands can appear under a clearly labeled group such as "More Witness Commands" or be excluded entirely from the beginner QuickPick.

### QuickPick Simplification Target

The current status bar QuickPick may present many commands. v5 should reduce visible QuickPick complexity so that a beginner user sees at most three to four actions. Advanced commands remain available via the command palette, not the status bar click.

---

## 8. Progressive Disclosure

v5 defines three user layers. The advanced system remains available in full, but the README and first-run UX start with the beginner layer only.

### Beginner Layer

The first-run experience, README introduction, and status bar default QuickPick should expose only:

- Enable Witness
- Start Tracking This Task
- Create Checkpoint
- Resume with Witness
- Resolve Continuity Issue

### Normal Layer

For users who understand Witness basics and have completed at least one checkpoint cycle:

- Prepare Session Switch
- Show Workspace Status
- Compress Current State
- Generate Handover
- Create Context Packet
- Review Subagent Task

### Advanced Layer

For power users who have read the methodology documentation:

- Risk Assessment commands
- ADR creation and update
- Full Subagent Ledger lifecycle
- Evaluation Summary
- Harness protocols
- Telemetry and evaluation artifacts

### Disclosure Trigger

Progressive disclosure does not require automatic detection of user skill level. It is achieved through documentation structure, README ordering, and status bar QuickPick ordering. Advanced commands are always available in the command palette. The beginner layer is simply what is surfaced first and explained first.

---

## 9. Proposed v5 Milestones

### v5.0 — Plan

Create this implementation plan only. No source code changes. No package.json changes. No new commands.

**Status: complete.**

### v5.1a — Beginner Command Aliases (partial: first two commands)

Added:
- `Witness: Enable for This Project` (commandId: `witness.enableProject`)
- `Witness: Start Tracking This Task` (commandId: `witness.startTrackingTask`)

New files:
- `src/commands/enableProject.ts`
- `src/commands/startTrackingTask.ts`

Modified files:
- `src/commands/initProject.ts` — extracted `performProjectInit` as a shared exported function
- `src/extension.ts` — registered both new commands
- `package.json` — added 2 activationEvents and 2 contributes.commands entries
- `src/templates/commands.md` — added Group 0 (Beginner Commands)
- `docs/v5-implementation-plan.md` — added this status note

Public command count: 23 → 25.
activationEvents count: 24 → 26.

`witness.createCheckpoint` and `witness.resumeWithWitness` are deferred to v5.1b.

**Status: complete.**

### v5.1b — Beginner Command Aliases (remaining two commands)

Added:
- `Witness: Create Checkpoint` (commandId: `witness.createCheckpoint`)
- `Witness: Resume with Witness` (commandId: `witness.resumeWithWitness`)

New files:
- `src/commands/createCheckpoint.ts`
- `src/commands/resumeWithWitness.ts`

Modified files:
- `src/extension.ts` — registered both new commands
- `package.json` — added 2 activationEvents and 2 contributes.commands entries
- `src/templates/commands.md` — added docs for both commands in Group 0
- `docs/v5-implementation-plan.md` — added this status note

Public command count: 25 → 27.
activationEvents count: 26 → 28.

All four beginner commands are now implemented. The beginner command layer is complete.

**Status: complete.**

### v5.1 — Beginner Command Aliases

Add the four beginner commands:

- `Witness: Enable for This Project` (commandId: `witness.enableProject`)
- `Witness: Start Tracking This Task` (commandId: `witness.startTrackingTask`)
- `Witness: Create Checkpoint` (commandId: `witness.createCheckpoint`)
- `Witness: Resume with Witness` (commandId: `witness.resumeWithWitness`)

These may wrap existing commands or reuse shared logic. No deep behavior changes in this milestone.

v5.1 intentionally adds four beginner-facing public commands. The public command count is expected to increase from 23 to 27. This is not a contradiction of the v5 goal. The goal is not fewer registered commands; the goal is fewer beginner-facing concepts and a simpler first-use path. The four new commands make the beginner path explicit without removing or hiding any existing advanced commands.

### v5.2 — Copy-Ready Agent Prompt Generator

Add core helper: `src/core/agentPromptGenerator.ts`

Responsibilities:
- Generate the start-task prompt
- Generate the resume prompt
- Optionally generate a checkpoint prompt
- Use `.witness/` paths only
- No automatic injection
- No LLM calls

**Status: complete.**

`src/core/agentPromptGenerator.ts` added, exporting `generateStartTaskPrompt` and `generateResumePrompt`.
`src/commands/startTrackingTask.ts` refactored to call `generateStartTaskPrompt({ taskGoal })`.
`src/commands/resumeWithWitness.ts` refactored to call `generateResumePrompt({ contextPacketPath })`.
`src/core/promptPresenter.ts` unchanged — remains the display and copy helper.
No new public commands. No package.json changes. No new dependencies.
Public command count remains 27. activationEvents count remains 28.

### v5.3 — First-Run Onboarding

Improve the first-use experience:

- After enabling Witness, show a short "what next" markdown page.
- Explain only the beginner flow.
- Include `Start Tracking This Task` as the next step.
- Avoid full methodology explanation in this surface.

**Status: complete.**

`src/core/onboardingContent.ts` added, exporting `generateFirstRunOnboarding()`.
`src/commands/enableProject.ts` updated:
- First-time enable: opens onboarding tab as unsaved markdown, shows
  `"Witness: Witness is enabled. Start by running 'Witness: Start Tracking This Task'."`.
- Already-enabled: shows friendly message + optional `Show Onboarding` notification action.
- Onboarding kept inside `enableProject.ts` only; `performProjectInit` and
  `witness.initProject` are not affected.
Telemetry event `witness.project.enabled` extended with `onboarding_opened: boolean`.
No new public commands. No package.json changes. No new dependencies.
Public command count remains 27. activationEvents count remains 28.

### v5.4 — Status Bar QuickPick Simplification

Make the status bar beginner-first:

- Resolve issue, checkpoint, and resume actions appear first.
- Advanced commands are moved lower or grouped under a secondary label.
- New users are not overloaded with many options on first click.

**Status: complete.**

`src/core/statusBar.ts` restructured (v5.4). QuickPick now has three sections:
- `Recommended` separator + one context-aware top item per spec priority rules.
- `Beginner Actions` separator + five beginner-safe commands, deduplicated against recommended.
- `Advanced Actions` separator + nine advanced commands, deduplicated against recommended and beginner.
`buildResolverItem` removed; superseded by `buildRecommendedItem` which implements the full
v5.4 priority rules. `StatusQuickPickItem.commandId` made optional to accommodate separator
items. `openStatusActions` handler guards for missing `commandId` before calling `executeCommand`.
Resolver logic (`resolveTopIssue`) retained with try/catch in `buildRecommendedItem`.
No new public commands. No package.json changes. No new dependencies.
Public command count remains 27. activationEvents count remains 28.

### v5.4a — Status Bar Tooltip Restoration

UX patch: restore and improve the Witness status bar hover tooltip after v5.4.

**Status: complete.**

`src/core/statusBar.ts` updated (v5.4a). `buildTooltip` return type changed from `string`
to `vscode.MarkdownString`. Two new helpers added: `formatAgeMinutes(ageMinutes)` and
`formatExistsAge(exists, ageMinutes)`.

Tooltip now shows: status label (bold), active session ID, suggested action + reason,
current-state age, latest-handover age, context-packet existence/age/mandatory-marker flag,
subagent health counts (pending reviews, incomplete ledgers, blocked/failed, loop-risk when
non-zero), telemetry active/inactive, and "Click for actions." footer.

Null-status fallback: `"Witness: status not computed yet. Click to open Witness actions."`
No-workspace: `"No workspace folder is open."`

v5.4 QuickPick structure (Recommended / Beginner Actions / Advanced Actions) unchanged.
No new public commands. No package.json changes. No new dependencies.

### v5.5 — README and Tutorial Rewrite

The README should start with:

- What Witness does
- The first 5-minute workflow
- Beginner commands
- Copy-ready prompt usage
- Links to advanced documentation lower in the document

Advanced command reference moves to a separate documentation file or a lower section of the README.

**Status: complete.**

`README.md` fully rewritten. Structure:
1. Title + one-line description
2. Short problem statement (ephemeral sessions, `.witness/` as project memory)
3. The 5-Minute Workflow (6 steps, beginner commands only)
4. Quick Start (dev install + `Enable for This Project` + `Start Tracking This Task`)
5. Tutorial: Your First Witness Workflow (7 steps using beginner commands)
6. Beginner Commands (6 commands, table)
7. What `.witness/` Contains (short table, 8 paths)
8. Default Read Set (3 files, no raw telemetry)
9. Agent Harness Pack (5 harness files + AGENTS.md, correct non-overclaim wording)
10. Progressive Subagent Ledger (3 levels, link to orchestrator.md)
11. What Witness Is Not (exact safe wording for context rot, observable degradation)
12. Advanced Commands and Documentation (no full table; links to commands.md, docs/)
13. Current Status (v5.4a, 27 commands, 28 events, no deps)

Removed: full 23-command inline table, v4.7-era version history, old `Initialize Project` /
`Start Session` tutorial path, `Five Continuity Risk Dimensions` deep section,
`Common Beginner Questions` verbatim FAQ.

### v5.6 — Fresh-User Regression Test

Create `docs/v5-validation-report.md`.

Success criterion: a new user can enable Witness, start tracking a task, checkpoint, and resume with a copy-ready prompt within 5 minutes, using only what is visible in the product without reading advanced documentation.

---

## 10. Non-Goals

v5 must not include any of the following:

- Copilot API integration
- Claude API integration
- Codex API integration
- Superpowers-specific API integration
- Chat participant registration
- Automatic context injection into any coding agent
- Automatic hidden session-log ingestion
- True token pressure detection
- Dashboard or webview UI
- Autonomous subagent launch
- Autonomous subagent retry
- Autonomous review or approval
- Raw transcript capture
- Hidden reasoning capture

These are out of scope for v5 and for Witness as a product within its current design boundaries.

---

## 11. Success Criteria

v5 succeeds when all of the following are true:

1. A new user can understand the basic Witness workflow in under 2 minutes by reading only the README introduction.
2. A new user can enable Witness and start tracking a task within 5 minutes of installation without reading advanced documentation.
3. The user does not need to understand handovers, context packets, risk dimensions, or subagent ledgers before receiving first value from the product.
4. `Start Tracking This Task` produces a copy-ready coding-agent prompt that the user can paste without modification.
5. `Resume with Witness` produces a copy-ready resume prompt that the user can paste without modification.
6. Advanced features remain fully accessible via the command palette and are not removed or degraded.
7. Witness does not overclaim direct context-rot or token-pressure detection in any user-facing string.
8. Witness does not automatically inject context into any coding agent.

---

## 12. Open Design Questions

**Q1.** Should beginner commands be new command IDs registered in package.json, or title aliases that resolve to existing command handlers at runtime? New IDs add to the command count; aliases may complicate handler resolution.

**Q2.** Should `Start Tracking This Task` update `current-state.md` automatically, ask for confirmation before writing, or only create a session record and display a prompt without touching current-state at all?

**Q3.** Should copy-ready prompts open in an unsaved markdown tab, copy directly to clipboard without a visible tab, or offer both options through a QuickPick? The tab is more readable; the clipboard action is faster for repeat users.

**Q4.** Should `Resume with Witness` prefer the latest reviewed context packet if one exists, or always display the default read set first and offer the context packet as a secondary option?

**Q5.** Should advanced commands remain equally visible in the command palette alongside beginner commands, or should documentation and status bar UX be the only place where the distinction is enforced?

**Q6.** Should the status bar QuickPick include an explicit "Beginner Mode / Advanced Mode" toggle, or should progressive disclosure be handled entirely through ordering and grouping without a mode switch?

**Q7.** How do beginner wrapper commands avoid duplicating logic already present in the commands they wrap? Should wrappers call the existing command handlers directly, share a common service layer, or be thin shims that forward arguments?

**Q8.** What is the exact acceptance test for "usable within 5 minutes"? Should this be a timed manual test with a fresh VS Code profile, a scripted walkthrough, or a checklist-based validation run by a reviewer who has not read the Witness documentation?

---

## 13. Validation Plan

v5 validation must confirm the following before the milestone is closed:

- **Compile check.** The extension compiles without errors after each milestone.
- **Command count check.** The public command count is tracked and does not grow beyond what v5.1 deliberately adds.
- **Beginner flow smoke test.** A tester who has not read Witness documentation can complete the six-step beginner flow using only in-product guidance.
- **Fresh workspace onboarding test.** A clean VS Code profile with a new repository is used; no prior `.witness/` directory exists; all four beginner commands run successfully in sequence.
- **Copy-ready prompt quality test.** The generated prompts are pasted into a real coding-agent session and verified to produce a correctly oriented response without modification.
- **No automatic context injection test.** Confirm that no Witness action writes to or modifies a coding-agent's active context window without the user explicitly copying and pasting.
- **No hidden-context overclaim test.** Confirm that no user-facing string in v5 claims that Witness directly detects token pressure, context rot, or hidden LLM reasoning state.
- **README first-user test.** A tester reads only the README introduction and can identify: what Witness does, what to run first, and what to do after the first task is tracked.

---

## Constraints

The following constraints apply to all v5 milestones:

- No source code changes in v5.0.
- No package.json changes in v5.0.
- No commands added in v5.0.
- No new dependencies at any milestone.
- No emojis in any user-facing string.
- Witness remains VS Code-first.
- The automatic/confirmed action boundary is preserved in all new commands.
- Do not claim guaranteed token reduction.
- Do not claim true hidden LLM context pressure detection.
- Do not make Witness an autonomous coding agent.

---

*End of v5 Implementation Plan.*
