# Witness Agent v8 Implementation Plan

**Theme:** Workflow-First Command Surface
**Status:** CLOSED. All milestones v8.0-v8.6 complete. 40 public commands. 41 activation events.
**Opened:** 2026-06-01
**Closed:** 2026-06-01

---

## 1. v8 Summary

v7 reduced first-use friction with `Witness: Start with Witness`, a native VS Code walkthrough,
`Witness: Start New Task`, and README cleanup. It gave new users a clearer way to initialize a
project, start AI-assisted work, and restart without manually deleting `.witness/` files.

But Witness still exposes many commands and concepts. The command surface remains closer to the
internal architecture than to the user moments that normal developers are trying to act on. A user
can still see ADRs, context packets, risk assessments, subagent ledgers, evaluation summaries,
checkpoints, handovers, and artifact maintenance before they understand what they should do next.

v8 redesigns the command surface around user moments. The goal is not to remove power. The goal is
to remove beginner exposure to power. Witness can keep its advanced internal commands, but the
visible beginner surface should expose helpful automation flows first.

The framing shifts:

From:

> "Which Witness command do I need?"

To:

> "What moment am I in: Start, Save, Resume, Switch, or Fix?"

Internal commands remain available for creator, debug, research, and power-user workflows.
Beginner UI should show workflow actions, not implementation details.

---

## 2. Product Problem

Witness currently has 31 public commands. That is too many for normal users to scan, understand,
and choose from during ordinary AI-assisted coding work.

Many commands expose accurate internal concepts:

- ADR
- context packet
- risk assessment
- subagent ledger
- evaluation summary
- checkpoint
- handover
- artifact maintenance validation

These concepts are useful. They are also not beginner concepts. A developer who is just trying to
start work, save progress, resume later, switch tasks, or fix a warning may experience Witness as a
system to study rather than a tool to use.

Existing command names are technically accurate, but they are not always user-intent friendly. The
command palette still asks the user to understand implementation details before choosing an action.

Advanced commands should remain available for creator and power-user workflows, but they should not
dominate the first-use surface.

---

## 3. v8 Mental Model

The v8 user model is:

> "Witness helps my coding agent remember project work."

The user should only need these moments:

| Moment | User meaning |
|---|---|
| Start | I am beginning AI-assisted work |
| Save | I am stopping soon or want to preserve progress |
| Resume | I am returning in a new AI session |
| Switch | I am moving to a new task |
| Fix | Witness says something needs attention |
| Status | I want to know what is happening |
| Update Memory | I want my coding agent to update Witness memory |
| Check Memory Update | I want Witness to validate agent-written memory |
| Cheatsheet | I am lost and need the one-page guide |

The first-use experience should teach these moments before it teaches Witness architecture.

---

## 4. Naming Strategy

Use Git as a metaphor, not as vocabulary. Witness has a continuity workflow that is somewhat like
starting, saving, resuming, and switching work, but it must not imply that it is performing source
control operations.

Do not use:

- Witness Commit
- Witness Fetch
- Witness Checkout

Reason: those names may imply Git or source-control behavior. Witness should not create confusion
about whether it is committing code, fetching remote state, or checking out branches.

Use user-intent names instead:

| New visible name | Existing behavior |
|---|---|
| Witness: Start | `witness.startWithWitness` |
| Witness: Status | `witness.showWorkspaceStatus` |
| Witness: Save Progress | `witness.createCheckpoint` |
| Witness: Resume | `witness.resumeWithWitness` |
| Witness: Switch Task | `witness.startNewTask` |
| Witness: Fix Issue | `witness.resolveContinuityIssue` |
| Witness: Update Memory | `witness.updateProjectMemoryWithAgent` |
| Witness: Check Memory Update | `witness.validateArtifactMaintenance` |
| Witness: Cheatsheet | new command planned |

Keep existing command IDs stable. Prefer aliases or wrappers where safe. Do not break old command
IDs, tests, documentation links, or existing user workflows.

---

## 5. Command Surface Tiers

v8 should classify commands into four tiers. This is a product and UI classification, not a removal
plan.

### Main Actions

Normal users see these first:

- Witness: Start
- Witness: Save Progress
- Witness: Resume
- Witness: Switch Task
- Witness: Fix Issue
- Witness: Status
- Witness: Cheatsheet

### Maintenance Actions

Shown when relevant:

- Witness: Update Memory
- Witness: Check Memory Update

### More Actions

Existing normal and power-user commands:

- Start Tracking This Task
- Enable for This Project
- Update Project Memory with Agent
- Validate Artifact Maintenance
- Show Workspace Status

These may remain searchable and available, but they should not be the primary beginner path.

### Advanced / Creator Tools

Commands mostly for creator, debug, research, advanced review, or orchestration workflows:

- Create ADR
- Create Context Packet
- Assess Continuity Risk
- Generate Evaluation Summary
- Subagent Ledger commands
- Record Subagent Evidence
- Create Subagent Context Packet
- Generate Handover
- Resume Probe
- Raw telemetry and evaluation-related commands

Do not remove these commands. Reclassify them so they do not dominate beginner UI.

---

## 6. v8.1 - Beginner Command Aliases

**Status:** Complete. Implemented as eight public alias commands that delegate to existing command
IDs with `vscode.commands.executeCommand`. Existing command IDs and advanced commands remain
available.

v8.1 count changes:

- Public commands: 31 -> 39
- Activation events: 32 -> 40
- Public `registerCommand` calls in `src/extension.ts`: 31 -> 39
- Runtime dependencies: unchanged at 0

Plan aliases or wrappers for:

- Witness: Start
- Witness: Status
- Witness: Save Progress
- Witness: Resume
- Witness: Switch Task
- Witness: Fix Issue
- Witness: Update Memory
- Witness: Check Memory Update

### Implementation Options

**Option A: Change contributed command titles only.**

Update the `contributes.commands[].title` values for safe beginner commands. This keeps command
count stable but changes what existing commands are called in the Command Palette.

Tradeoff: old names may stop being directly searchable unless they are preserved elsewhere.

**Option B: Add new command aliases that call existing commands.**

Add new command IDs whose handlers delegate to existing behavior. Example:
`witness.saveProgress` calls the same implementation as `witness.createCheckpoint`.

Tradeoff: public command count increases unless old commands are hidden, moved, or otherwise
de-emphasized.

**Option C: Hybrid.**

Change titles for commands that are already beginner-facing and add aliases where old names must
remain stable for docs, tests, or power users.

### Recommendation

Use aliases or wrappers first to avoid breaking existing docs, tests, and user workflows. Keep old
command IDs available.

Expected count impact before implementation:

| Path | Public commands | Activation events |
|---|---:|---:|
| Baseline after v7 | 31 | 32 |
| Title changes only | 31 | 32 |
| Add 8 beginner aliases | 39 | 40 |
| Add 8 aliases plus Cheatsheet later | 40 | 41 |

Before implementing v8.1, decide whether count growth is acceptable or whether old commands should
be hidden from prominent surfaces while remaining available.

### Files Expected To Change In v8.1

- `package.json` for command contributions and activation events if aliases are added.
- `src/extension.ts` for command registration if aliases are added.
- Command implementation files only if a shared helper is needed to avoid duplicated behavior.
- Tests that assert command count or command titles.

### Validation

- Compile succeeds.
- Old command IDs still execute.
- New aliases execute the intended existing behavior.
- `witness.openStatusActions` remains internal only and is not added to `package.json`.
- Public command count and activation event count are documented.

---

## 7. v8.2 - Witness Cheatsheet

**Status:** Complete. Implemented as `witness.cheatsheet`, with source template
`src/templates/CHEATSHEET.md` and workspace copy `.witness/CHEATSHEET.md`.

v8.2 count changes:

- Public commands: 39 -> 40
- Activation events: 40 -> 41
- Public `registerCommand` calls in `src/extension.ts`: 39 -> 40
- Runtime dependencies: unchanged at 0

Implementation decisions:

- Use command ID `witness.cheatsheet`.
- Copy `CHEATSHEET.md` during init/enable through the existing top-level template path.
- If `.witness/CHEATSHEET.md` is missing but `.witness/` exists, restore it with
  write-if-missing behavior and open it.
- If `.witness/` is missing, do not initialize automatically; tell the user to run
  `Witness: Start` first.
- If `.witness/CHEATSHEET.md` already exists, open it without overwriting.

Plan a one-page cheatsheet that answers:

> "What should I do now?"

### Files

- Add template: `src/templates/CHEATSHEET.md`
- Create workspace copy after init or enable: `.witness/CHEATSHEET.md`

### Optional Command

- Title: `Witness: Cheatsheet`
- Command ID: `witness.cheatsheet`

If implemented as a public command, this adds one public command and one activation event.

### Suggested Cheatsheet Content

```markdown
# Witness Cheatsheet

Witness helps your coding agent remember project work.

## Start here

Run:
Witness: Start

Then:
1. Answer what you are working on.
2. Copy the generated prompt.
3. Paste it into your coding agent.
4. Code normally.

## What do I use when?

| Situation | Use |
|---|---|
| I am starting work | Witness: Start |
| I am switching task | Witness: Switch Task |
| I am stopping soon | Witness: Save Progress |
| I am returning later | Witness: Resume |
| Witness warns me | Click the Witness status bar |
| I feel lost | Witness: Status |
| My agent updated Witness memory | Witness: Check Memory Update |

## Do not worry about this at first

You do not need these on day one:
- handovers
- context packets
- subagent ledgers
- risk dimensions
- ADRs
- telemetry
```

### Behavior Questions To Resolve

- Should the cheatsheet be copied into `.witness/` during init and enable?
- Should missing `.witness/CHEATSHEET.md` be recreated automatically?
- Should `Witness: Cheatsheet` open the workspace copy, the template, or an untitled generated
  document?
- Should the cheatsheet be included in walkthrough content?

### Validation

- Fresh workspace receives or can open the cheatsheet.
- Existing initialized workspace can open or regenerate the cheatsheet.
- Missing cheatsheet behavior is deterministic.
- No LLM calls, hidden prompt injection, or source-code modifications are introduced.

---

## 8. v8.3 - Status Bar Command Surface

**Status:** Complete. The status bar click menu now uses workflow-first aliases in Main Actions,
adds a separate Maintenance section, and keeps original/advanced commands available under More
Actions.

v8.3 count changes:

- Public commands: unchanged at 40
- Activation events: unchanged at 41
- Public `registerCommand` calls in `src/extension.ts`: unchanged at 40
- Runtime dependencies: unchanged at 0

Implementation decisions:

- Keep the existing recommended-action logic and status bar tooltip behavior.
- Normalize recommended command IDs to workflow aliases for display, execution, and dedupe.
- Use v8 alias IDs for Main Actions: `witness.start`, `witness.saveProgress`, `witness.resume`,
  `witness.switchTask`, `witness.status`, `witness.cheatsheet`, and `witness.fixIssue`.
- Use v8 alias IDs for Maintenance: `witness.updateMemory` and `witness.checkMemoryUpdate`.
- Keep original and advanced commands under More Actions, except when they duplicate the current
  recommended workflow action.

### v8.3a - Status Bar Maintenance Label

**Status:** Complete. Maintenance-only issues such as stale `current-state.md`, checkpoint needed,
or handover preparation now show `Witness: Save Needed` instead of `Witness: Review Needed`.
Subagent review needs still show `Witness: Review Needed`, critical risks still show
`Witness: Attention`, no-session state shows `Witness: Start`, and all-clear state shows
`Witness: OK`.

Plan status bar click layout around moments instead of implementation details.

Recommended:

- One next best action

Main Actions:

- Start
- Save Progress
- Resume
- Switch Task
- Status
- Cheatsheet
- Fix Issue

Maintenance:

- Update Memory
- Check Memory Update

More Actions:

- Existing advanced and power-user commands

Purpose: the status bar becomes the main guide, not a command toolbox.

Do not remove advanced commands from the Command Palette.

### Expected Behavior

The status bar should lead with the most relevant next action based on the current workspace state.
The click menu should remain useful for power users, but the first visible group should map to the
v8 moments.

### Files Expected To Change In v8.3

- Status bar action composition files.
- Suggested action or command-group helpers, if they exist.
- Tests for status bar quick-pick items.

### Validation

- Fresh workspace status bar shows a clear start path.
- Active session status bar shows save, switch, status, and relevant maintenance actions.
- Advanced commands remain accessible in the Command Palette.
- Status bar does not become a complete command dump.

---

## 9. v8.4 - README / Onboarding Simplification

**Status:** Complete. README and first-run onboarding now lead with the workflow-first command
surface: `Witness: Start`, `Witness: Save Progress`, `Witness: Resume`, `Witness: Switch Task`,
`Witness: Fix Issue`, `Witness: Status`, and `Witness: Cheatsheet`.

v8.4 count changes:

- Public commands: unchanged at 40
- Activation events: unchanged at 41
- Public `registerCommand` calls in `src/extension.ts`: unchanged at 40
- Runtime dependencies: unchanged at 0

Implementation decisions:

- Keep old command names lower under manual/advanced compatibility language.
- Keep safety boundaries prominent: no direct LLM call, no automatic prompt injection, no
  automatic source-code modification.
- Keep advanced concepts out of the top onboarding path.
- Document the v8.3 status bar groups: Recommended, Main Actions, Maintenance, More Actions.

Plan README top rewrite:

```markdown
Witness helps your AI coding sessions remember what matters.

Start:
1. Run Witness: Start
2. Answer what you are working on
3. Paste prompt into coding agent
4. Code normally

Need help?
Run Witness: Cheatsheet
```

Move detailed `.witness/`, harness, subagent, ADR, and artifact maintenance explanations lower.
README should not feel like the user must learn the whole system first.

### README Structure

1. What Witness does in one sentence.
2. Start in four steps.
3. What to do when stopping, resuming, switching, or seeing a warning.
4. Cheatsheet pointer.
5. Maintenance workflow.
6. Advanced concepts.
7. Architecture and creator/research sections.

### Validation

- A new user can start without reading architecture docs.
- The top section does not introduce ADRs, subagents, context packets, telemetry, or evaluation
  summaries.
- Advanced material remains available lower in the README.

---

## 10. v8.5 - Advanced / Creator Command Classification

**Status:** Complete. `src/templates/commands.md` now opens with six command tiers:
Main user workflows, Maintenance workflows, Compatibility / manual names, Advanced / creator
tools, Subagent / orchestrator tools, and Debug / evaluation tools.

v8.5 count changes:

- Public commands: unchanged at 40
- Activation events: unchanged at 41
- Public `registerCommand` calls in `src/extension.ts`: unchanged at 40
- Runtime dependencies: unchanged at 0

Implementation decisions:

- Main user workflows and Maintenance workflows appear before detailed command reference material.
- Older command names are documented as compatibility/manual names, not deprecated commands.
- ADR, handover, context packet, risk, and resume-probe commands are classified as Advanced /
  creator tools.
- Subagent commands are classified under Subagent / orchestrator tools.
- Workspace observation, evaluation summary, and lower-level reporting/session commands are
  classified under Debug / evaluation tools.

Plan to document command categories:

- Main user workflows
- Maintenance workflows
- Advanced tools
- Creator/debug/research tools

Classification guidance:

| Area | Classification |
|---|---|
| ADR | Creator / Advanced |
| Subagent ledger commands | Advanced / Orchestrator |
| Evaluation summary | Debug / Research |
| Context packet | Advanced / Resume internals |
| Risk assessment | Advanced / Diagnostics |
| Handover | Advanced / Team or agent handoff |
| Resume probe | Advanced / Diagnostics |

The classification should affect onboarding, README ordering, status bar menus, walkthrough
language, and any future command-group UI. It should not remove commands.

### Validation

- Main workflows appear first in beginner surfaces.
- Advanced commands remain available.
- Existing command IDs remain stable.
- Classification is documented where future maintainers can preserve it.

---

## 11. v8.6 - Fresh-User Command Surface Regression

**Status:** Complete. Created `docs/v8-validation-report.md` and closed v8 after validating the
workflow-first command surface, final counts, non-goals, known limitations, and fresh-user
regression checklist.

v8.6 count changes:

- Public commands: unchanged at 40
- Activation events: unchanged at 41
- Public `registerCommand` calls in `src/extension.ts`: unchanged at 40
- Runtime dependencies: unchanged at 0

Plan validation report:

- `docs/v8-validation-report.md`

Fresh-user regression questions:

- Can a new user find the right command in under 30 seconds?
- Can they start without reading architecture docs?
- Can they switch tasks without deleting files?
- Can they save progress without knowing "checkpoint" terminology?
- Can they resume without understanding context packets?
- Can they open Cheatsheet when lost?
- Are advanced commands still available but not prominent?

### Suggested Regression Matrix

| Scenario | Expected result |
|---|---|
| Fresh workspace, Command Palette search "Witness" | Beginner actions are easy to identify |
| Fresh workspace, status bar click | Start is the clear next step |
| Initialized workspace, no active session | Resume or Start is clear, depending on state |
| Active session, stopping soon | Save Progress is visible |
| Active session, new task | Switch Task is visible and does not delete files |
| Agent updated `.witness/` memory | Check Memory Update is visible |
| User searches "ADR" | Advanced command remains available |
| User searches "checkpoint" | Existing command remains available or discoverable |

---

## 12. Non-Goals

v8 must not include:

- code graph
- context lifecycle OS
- automatic memory consolidation worker
- direct LLM API integration
- MCP server
- marketplace polish
- webview dashboard
- automatic source-code modification
- automatic prompt injection
- hidden transcript capture
- hidden reasoning capture
- removing advanced commands entirely
- breaking existing command IDs

v8 also must not overclaim direct coding-agent integration, hidden token pressure detection, or any
autonomous coding-agent behavior.

---

## 13. v8 Milestones

Use this sequence:

### v8.0 - Workflow-First Command Surface Plan

Create this plan only.

Constraints:

- No source code changes.
- No `package.json` changes.
- No dependency changes.
- No command additions.
- No README changes.
- No status bar behavior changes.

### v8.1 - Beginner Command Aliases

Introduce the beginner command surface through title changes, aliases, or a hybrid approach.
Document exact command-count and activation-event changes before merging.

### v8.2 - Witness Cheatsheet

Add the cheatsheet template, workspace creation/open behavior, and optional public command.

### v8.3 - Status Bar Command Surface Simplification

Rework status bar actions around recommended, main, maintenance, and more-action groups.

### v8.4 - README / Onboarding Simplification

Rewrite the README top section around Start, Save, Resume, Switch, Fix, Status, and Cheatsheet.

### v8.5 - Advanced / Creator Command Classification

Document and apply command categories so beginner surfaces remain workflow-first.

### v8.6 - Fresh-User Command Surface Regression

Create `docs/v8-validation-report.md` and validate the beginner command surface against fresh and
already-initialized workspaces.

---

## 14. Open Questions

Q1. Should beginner aliases add new public commands or replace existing contributed titles?

Q2. Should old command titles remain searchable in Command Palette?

Q3. Should the status bar show only aliases or both aliases and original commands?

Q4. Should Cheatsheet be copied to `.witness/CHEATSHEET.md` on init, or exist only in
docs/onboarding?

Q5. Should `Witness: Cheatsheet` be a new public command?

Q6. What should happen if `.witness/CHEATSHEET.md` is missing?

Q7. Should ADR and subagent commands be hidden from status bar but remain in Command Palette?

Q8. Should README mention advanced commands at all near the top?

Q9. How should command count changes be documented if aliases are added?

Q10. Can "Save Progress" fully replace "Create Checkpoint" in user-facing language?

Additional implementation questions:

Q11. Should command aliases have separate telemetry labels if telemetry is present, or reuse the
underlying command identity?

Q12. Should walkthrough steps use only v8 names after aliases exist?

Q13. Should validation tests assert exact command order in status bar menus, or only tier grouping?

---

## 15. Validation Plan

v8 validation should include:

- compile check
- command count check
- activation event count check
- no dependency check
- fresh workspace test
- already-initialized workspace test
- status bar command surface test
- cheatsheet creation/open test
- README first-user review
- command search review
- no automatic injection test
- no LLM call test
- no advanced command removal test

### v8.0 Validation

For this planning milestone:

- `npm run compile` should pass.
- Changed files should include only `docs/v8-implementation-plan.md`.
- `package.json` should remain unchanged.
- `src/extension.ts` should remain unchanged.
- Runtime dependency count should remain unchanged.
- Public command count should remain 31.
- Activation event count should remain 32.

### Later Milestone Validation

Each implementation milestone should update `docs/v8-validation-report.md` with:

- command count after the milestone
- activation event count after the milestone
- runtime dependency count
- files changed
- fresh-workspace result
- already-initialized workspace result
- explicit confirmation that advanced commands remain available
- explicit confirmation that no hidden LLM call or automatic prompt injection was added

---

## Constraints

- v8.0 is docs only.
- No source code changes in v8.0.
- No `package.json` changes in v8.0.
- No dependency changes in v8.0.
- No command additions in v8.0.
- No emojis.
- Keep Witness VS Code-first.
- Keep advanced commands available.
- Do not overclaim direct coding-agent integration.
- Do not claim true hidden token pressure detection.
- Do not make Witness an autonomous coding agent.
