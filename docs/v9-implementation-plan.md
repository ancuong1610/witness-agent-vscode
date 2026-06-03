# Witness Agent v9 Implementation Plan

**Theme:** Guided Save Progress + Hidden Advanced Surface
**Status:** CLOSED. All milestones v9.0-v9.7 complete. 9 contributed commands. 41 activation events. 40 public command registrations. 0 runtime dependencies.
**Opened:** 2026-06-01
**Closed:** 2026-06-02
**Release hardening:** v9.8 completed 2026-06-03

---

## 1. v9 Summary

v8 made Witness easier to understand by adding workflow-first command names. It shifted the
beginner command surface toward user moments such as Start, Save Progress, Resume, Switch Task,
Fix Issue, Status, Update Memory, Check Memory Update, and Cheatsheet.

Live testing on a fresh sample project showed that better names alone are not enough. The workflow
after Start is still too manual, and users can still hesitate after implementation because several
commands sound plausible:

> "I finished coding, which Witness command do I use now?"

v9 turns Save Progress into the guided post-work loop:

> "I finished coding, so I run Witness: Save Progress."

Save Progress should guide the user from "I did work" to "my project memory is safely updated"
without requiring them to understand Witness internals. It should be the obvious command after
meaningful coding.

v9 also hides advanced/internal commands from the normal Command Palette surface. Advanced
capabilities remain registered and accessible through More Actions, `.witness/commands.md`,
internal command execution, and future creator/developer surfaces where needed. The goal is
beginner focus, not capability removal.

Current baseline before v9 implementation:

| Metric | Count |
|---|---:|
| Public command contributions in `package.json` | 40 |
| Activation events in `package.json` | 41 |
| Public `registerCommand` calls in `src/extension.ts` | 40 |
| Runtime dependencies | 0 |

`witness.openStatusActions` remains internal only and must not be added to `package.json`.

---

## 2. Product Problem

v8 improved command names, but it did not fully remove the need for users to understand Witness
implementation details after they finish coding.

Observed issues from live testing:

- Typing `Witness: Start` in the Command Palette still shows too many Start-related commands:
  `Witness: Start`, `Witness: Start Tracking This Task`, `Witness: Start with Witness`,
  `Witness: Start Session`, and `Witness: Start Subagent Task`.
- After running Start and pasting the generated prompt into a coding agent, the wording still makes
  the user hesitate about what to do next.
- Immediately after starting, the status bar can show `Witness: Save Needed`, which feels
  misleading because the user just started coding.
- After finishing a task, the user is unsure whether to run Save Progress, Update Memory, Check
  Memory Update, edit `current-state.md` manually, or create an ADR.
- Users expect Save Progress to be enough for manually preserving important decisions and
  architecture information.
- `current-state.md` still contains placeholders, but neither the file nor the workflow clearly
  explains when and how those placeholders get replaced.
- `Check Memory Update` sounds like it might update memory, but it actually validates memory after
  the coding agent has updated artifacts.
- Advanced commands remain visible in the Command Palette and create cognitive noise.

The result is that Witness still asks the user to choose from internal concepts at the exact moment
when they want one simple post-work action.

---

## 3. v9 User Mental Model

The v9 user model is:

> "Witness helps my coding agent remember project work, and I save that memory with Save Progress."

Core command meanings:

| Command | User meaning |
|---|---|
| Start | Begin work |
| Save Progress | Preserve what changed and what matters |
| Resume | Continue later |
| Switch Task | Move to another task |
| Fix Issue | Resolve a Witness warning |

Main post-work rule:

> After meaningful coding, run `Witness: Save Progress`.

The user should not need to decide between checkpointing, updating memory, validating artifacts,
editing `current-state.md`, or creating an ADR during the normal workflow. Save Progress should
guide them to the right next step.

---

## 4. v9 Design Principles

1. One post-work command.
2. Save Progress should guide memory update, checkpoint, and decision capture.
3. Do not show Save Needed immediately after Start unless there is meaningful work or elapsed risk.
4. Hide advanced commands from beginner discovery.
5. `current-state.md` placeholders must explain how they get replaced.
6. Check Memory Update validates; it does not update.
7. ADR is advanced; important decisions should first be captured by Save Progress.
8. The status bar should guide, not confuse.

Additional constraints:

- Keep Witness VS Code-first.
- Keep runtime dependencies at zero unless a future milestone explicitly justifies a change.
- Do not overclaim direct coding-agent integration.
- Do not claim true hidden token pressure detection.
- Do not make Witness an autonomous coding agent.
- Do not add automatic prompt injection, source-code modification, transcript capture, or reasoning
  capture.

---

## 5. v9.1 - Hide Advanced Commands from Command Palette

**Status:** Complete. v9.1 keeps all 40 command handlers registered, keeps all 41 activation
events for hidden-command activation safety, and reduces `package.json` `contributes.commands`
from 40 visible Command Palette commands to 9 workflow-first commands. Runtime dependencies remain
0.

Visible contributed commands after v9.1:

- `witness.start` / `Witness: Start`
- `witness.status` / `Witness: Status`
- `witness.saveProgress` / `Witness: Save Progress`
- `witness.resume` / `Witness: Resume`
- `witness.switchTask` / `Witness: Switch Task`
- `witness.fixIssue` / `Witness: Fix Issue`
- `witness.updateMemory` / `Witness: Update Memory`
- `witness.checkMemoryUpdate` / `Witness: Check Memory Update`
- `witness.cheatsheet` / `Witness: Cheatsheet`

Decision: `witness.enableProject` is hidden from the normal Command Palette surface because
`Witness: Start` handles first-run setup. It remains registered and available through More Actions
or internal execution after activation.

**Goal:** Reduce command discovery noise.

### Problem

Typing `Witness: Start` currently shows multiple Start-related commands, including advanced and
legacy commands. This makes the user compare names that reflect internal implementation layers
instead of choosing one obvious workflow action.

### Plan

Keep command handlers registered internally, but remove or de-emphasize old and advanced commands
from `package.json` `contributes.commands` where safe.

Visible Command Palette commands should prioritize:

- `Witness: Start`
- `Witness: Save Progress`
- `Witness: Resume`
- `Witness: Switch Task`
- `Witness: Fix Issue`
- `Witness: Status`
- `Witness: Cheatsheet`
- `Witness: Update Memory`
- `Witness: Check Memory Update`

Advanced/internal commands should remain accessible through:

- Status bar More Actions
- `.witness/commands.md`
- Internal command execution
- Developer/creator mode later if needed

Do not remove:

- Command handlers
- Internal behavior
- Advanced capabilities
- Existing command IDs

### Implementation Notes

Before editing `package.json`, verify whether a command can be registered in `src/extension.ts` but
not contributed in `package.json` and still be callable through `vscode.commands.executeCommand`.
Expected VS Code behavior is yes for extension-registered commands after activation, but v9.1 must
confirm this with a local extension host test or a focused reference check before relying on it.

Activation behavior must also be checked. If a hidden command is not listed in `activationEvents`,
it may not be callable from outside the extension before activation. Because this project also uses
`workspaceContains:.witness/index.md`, hidden advanced commands may still work in initialized
Witness workspaces, but uninitialized or cross-extension command execution should be considered
explicitly.

### Acceptance Criteria

- Beginner Command Palette surface contains only the approved visible commands.
- Hidden advanced command handlers remain registered after activation.
- Hidden advanced commands remain reachable through More Actions or internal workflows where
  applicable.
- `witness.openStatusActions` remains internal only and is not contributed.
- Public command contribution count decreases or is otherwise documented.
- Activation event count is documented and intentional.

---

## 6. v9.2 - Post-Start Tracking State

**Status:** Complete. v9.2 adds a pure status-label mapper and uses a conservative Tracking grace
state after Start. With an active session, stale or missing `current-state.md` alone now labels the
status bar as `Witness: Tracking` instead of `Witness: Save Needed`. Info-level "no handover yet"
setup evidence also stays `Tracking`.

Exact v9.2 rule:

- No active session remains `Witness: Start`.
- Critical suggested actions remain `Witness: Attention`.
- Subagent review maintenance remains `Witness: Review Needed`.
- `create-checkpoint` maintenance remains `Witness: Save Needed`.
- `prepare-handover` remains `Witness: Save Needed` only when severity is warning/critical or
  source-work evidence is present.
- `update-current-state` shows `Witness: Tracking` until source-work evidence is present.
- All-clear active sessions show `Witness: Tracking`.

Source-work evidence is currently detected from the existing VS Code git observer by looking for
dirty paths outside `.witness/`. The status bar refreshes on saved workspace files so source saves
can transition the label from `Tracking` to `Save Needed` when git evidence is available. If git
evidence is unavailable, Witness stays conservative and does not show Save Needed for
current-state-only maintenance.

**Goal:** After `Witness: Start`, the status bar should not immediately show `Witness: Save Needed`
only because `current-state.md` is a fresh placeholder or stale template.

### Problem

Save Needed immediately after Start feels like a warning before the user has done anything. It can
make a fresh user think they already missed a required step.

### Plan

Add or refine label logic:

- After an active session starts and no meaningful work has happened yet, show `Witness: Tracking`.
- Save Needed should appear when there is real post-work value:
  - Files changed meaningfully.
  - A checkpoint is recommended.
  - `current-state.md` remains stale after work.
  - A handover/checkpoint threshold is reached.
  - A maintenance trigger has meaningful evidence beyond initial placeholders.
- Tooltip text may still mention that `current-state.md` needs updating after first meaningful work.

### Detection Options

Meaningful work detection is an open implementation question. Candidate signals:

| Signal | Strength | Weakness |
|---|---|---|
| Dirty git state | Strong when git is available | Fails in non-git workspaces |
| Changed file count | Good for source changes | Requires reliable watcher or git diff source |
| Session age | Simple fallback | Time alone does not prove work happened |
| Placeholder detection | Useful for onboarding | Should not alone force Save Needed immediately |
| Maintenance trigger evidence | Reuses existing model | Current rules may need post-start context |

Recommended direction: use a small post-start grace state that prefers `Tracking` until Witness sees
either file-change evidence or elapsed/session risk evidence. Non-git workspaces should use file
watcher evidence or session age as a fallback, but the exact threshold should be conservative.

### Acceptance Criteria

- Fresh Start flow shows `Witness: Tracking`, not `Witness: Save Needed`, when no work evidence
  exists yet.
- Save Needed appears after meaningful work or real maintenance risk.
- Non-git workspaces have a defined fallback behavior.
- Tooltip wording explains the next action without implying the user already failed.

---

## 7. v9.3 - Save Progress Guided Flow

**Status:** Complete. `witness.saveProgress` now runs a guided QuickPick workflow instead of
delegating directly to `witness.createCheckpoint`. `witness.createCheckpoint` remains unchanged and
available internally.

Implemented flow:

- No active session: show a clear "start a task before saving progress" message and offer to run
  `witness.start`.
- `current-state.md` placeholders or `update-current-state` maintenance: recommend
  "Save progress + update project memory".
- Dirty source-work evidence or `create-checkpoint` maintenance: recommend
  "Save current progress".
- Save current progress: execute `witness.createCheckpoint`, refresh the status bar, and show a
  short follow-up message.
- Save progress + update project memory: execute `witness.createCheckpoint`, then `witness.updateMemory`,
  then offer an optional `Check Memory Update` action without validating automatically.
- Save architecture or decision note: open a memory-first coding-agent prompt that updates
  `.witness/current-state.md` and the active session first, and creates an ADR candidate only if
  stable and developer-approved.
- Prepare resume context: execute `witness.resume`.

Telemetry event: `witness.save_progress.guided`, with option, active-session, maintenance kind,
checkpoint/update-memory/check-memory flags, completion, and cancellation fields only. It does not
store prompt text, file contents, chat transcripts, or hidden reasoning.

**Goal:** Make `Witness: Save Progress` sufficient after finishing a task.

### Current Issue

Before v9.3, Save Progress mapped directly to Create Checkpoint behavior. That behavior remains
useful, but users also need guidance for memory update, validation, and lightweight decision
capture.

### Plan

When the user runs Save Progress, guide them through:

1. Save current progress.
2. Update project memory with the coding agent.
3. Check memory update after `.witness/` artifacts are edited.
4. Optionally capture decision or architecture notes.
5. Optionally prepare resume context.

Suggested QuickPick:

**What should Witness save?**

- Recommended: Save current progress
- Save progress + update project memory with agent
- Save architecture or decision note
- Prepare resume context
- Cancel

Recommended default should be contextual:

| Workspace state | Recommended option |
|---|---|
| `current-state.md` has placeholders or appears stale | Save progress + update project memory with agent |
| Project changed and `current-state.md` appears fresh | Save current progress |
| Architecture decision likely | Offer decision note, but do not force ADR |
| User is stopping or context risk is high | Offer prepare resume context |

Save Progress should stay short. The target is one or two clear steps, not a long wizard.

### Design Boundary

Save Progress should be a guided entry point. It can delegate to existing flows such as checkpoint
creation, update-memory prompt generation, memory validation, or handover preparation. It should
not automatically approve memory updates, modify source code, call an LLM, inject prompts, or
silently write unreviewed project facts.

### Acceptance Criteria

- Save Progress presents one clear post-work choice.
- Recommended option reflects current Witness evidence where possible.
- User can trigger update-memory guidance from Save Progress.
- User is told to run Check Memory Update after the coding agent edits `.witness/` files.
- Decision capture is available without forcing ADR creation.
- Existing checkpoint capability remains available.

---

## 8. v9.4 - `current-state.md` Placeholder Guidance

**Status:** Complete. Fresh `current-state.md` files now include a short new-project note explaining
that placeholders are expected, become useful after meaningful work, and should be updated through
`Witness: Save Progress` and `Witness: Check Memory Update`. The note tells users not to invent
architecture details, to use `Unknown` or `To be confirmed`, and to treat ADRs as advanced records
for stable developer-approved decisions.

The current-state harness and generated update-current-state maintenance prompt now include
placeholder rules: replace placeholders only with confirmed project files or developer-provided
facts, do not invent purpose/architecture/stack/status, record changed files/outcome/validation/next
safe step, update the active session file only when the Save Progress flow asks for it, and mention
remaining uncertainty.

**Goal:** Make `current-state.md` understandable before it is filled.

### Problem

The template contains placeholders such as `{{PROJECT_NAME}}`, `{{CURRENT_PHASE}}`, and
`{{NEXT_SAFE_STEP}}`. These are useful scaffolding, but in a new project they can reduce trust if
the user is not told how and when they should be replaced.

### Plan

Update the `current-state.md` template with a clear note near the top:

```markdown
New project?
After your first meaningful coding step, run Witness: Save Progress.
Witness will guide your coding agent to replace these placeholders with confirmed project facts.
```

Also update the maintenance prompt/harness so the coding agent knows to:

- Replace obvious placeholders only when facts are confirmed.
- Avoid inventing project facts.
- Record uncertainty.
- Update the active session file if relevant.
- Mention validation results and the next safe step.

### Acceptance Criteria

- New `current-state.md` files explain why placeholders exist.
- The update-memory prompt tells the coding agent how to replace placeholders safely.
- The maintenance harness forbids invented project facts.
- Validation can flag unresolved placeholders where appropriate without treating a fresh untouched
  project as already broken.

---

## 9. v9.5 - Start Prompt Ending

**Status:** Complete. The generated Start prompt now ends with an `After reading context` section
that tells the coding agent to summarize current project state, propose the next coding plan, ask
the developer to approve or adjust before editing source files, and remind the developer to run
`Witness: Save Progress` after implementation. The prompt also says not to update `.witness/`
files unless the developer asks to save progress or update memory, and not to claim validation
passed unless actual validation output exists.

The Start notification now tells the user to paste the prompt into the coding agent, approve or
adjust the proposed plan, code normally, and run `Witness: Save Progress` when meaningful work is
done.

**Goal:** Reduce hesitation after pasting the Start prompt into Codex, Claude, Copilot, or another
coding agent.

### Problem

After Start, the generated prompt should make the human's next step obvious. The agent should read
context, summarize state, propose a plan, and wait for approval before editing source files.

### Plan

Update the Start prompt ending to say:

```markdown
After reading Witness context:
1. Summarize current project state.
2. Propose the next coding plan.
3. Ask the developer for approval before editing source files.
4. After implementation, remind the developer to run Witness: Save Progress.
```

Update the notification after prompt generation:

```text
Paste this into your coding agent. After the agent proposes a plan, approve or adjust it, then code
normally. When the task is done, run Witness: Save Progress.
```

### Acceptance Criteria

- Start prompt ending gives the coding agent a clear four-step behavior.
- User notification explains what to do after pasting the prompt.
- Prompt wording does not claim automatic agent integration.
- Prompt wording does not authorize source edits before developer approval.

---

## 10. v9.6 - Save Progress / Memory Validation UX

**Status:** Complete. Save Progress and Update Memory now both tell the user that after the coding
agent updates `.witness/`, they should run `Witness: Check Memory Update`. Check Memory Update
wording now says it validates existing `.witness/` changes and does not update memory itself. A
passed validation tells the user to continue coding, run `Witness: Save Progress` again later, or
run `Witness: Resume` next time. The command refreshes the status bar after successful validation.

**Goal:** Clarify the difference between Update Memory, Check Memory Update, and Save Progress.

### Command Meanings

| Command | Meaning |
|---|---|
| Update Memory | Ask the coding agent to update Witness artifacts |
| Check Memory Update | Validate the artifacts after update |
| Save Progress | Guided entry point that can call both flows |

### Plan

After Save Progress generates an update-memory prompt, always tell the user:

```text
After the coding agent edits .witness files, run Witness: Check Memory Update.
```

Optionally add a notification action:

```text
Run Check Memory Update
```

Do not automatically approve memory updates. The developer remains responsible for reviewing
agent-edited `.witness/` artifacts before validation and before considering the memory update
complete.

### Acceptance Criteria

- Update Memory wording says it generates a prompt for the coding agent.
- Check Memory Update wording says it validates artifacts after edits.
- Save Progress can guide the user through both steps without hiding review responsibility.
- Optional notification action runs validation only when the user chooses it.

---

## 11. v9.7 - Validation Report and Closeout

**Status:** Complete. `docs/v9-validation-report.md` was created. Compile and final count checks
passed, and v9 is closed.

**Goal:** Create `docs/v9-validation-report.md` and close v9 only after behavior is verified.

Validate:

- Command counts.
- Activation event count.
- Hidden/visible command surface.
- Post-start status label.
- Save Progress guided flow.
- `current-state.md` placeholder guidance.
- Start prompt clarity.
- Update Memory -> Check Memory Update loop.
- No LLM calls.
- No automatic injection.
- No automatic source-code modification.
- Advanced commands preserved.
- Runtime dependency count remains zero.

### Validation Report Contents

`docs/v9-validation-report.md` should include:

- Final command contribution count.
- Final activation event count.
- Final public `registerCommand` count.
- Runtime dependency count.
- List of visible Command Palette commands.
- List of hidden-but-registered advanced commands.
- Manual test notes for fresh project Start flow.
- Manual test notes for post-start Tracking label.
- Manual test notes for Save Progress guided flow.
- Manual test notes for placeholder replacement guidance.
- Compile/test results.
- Known residual risks.

---

## 11a. v9.8 - Session Record + Decision Capture Completion

**Status:** Complete. v9.8 is a release-hardening patch before packaging 0.3.0.

Live testing showed that after meaningful architecture/scaffolding work, the active session record
could still look like an untouched template and decision memory could remain empty. v9.8 keeps the
core product rule intact:

> After meaningful work, run `Witness: Save Progress`.

Changes:

- The session template now explains that it starts as a tracking template and should be completed
  through Save Progress with files touched, decisions made, validation results, implementation
  outcome, and next safe step.
- The update-current-state maintenance prompt now explicitly asks the coding agent to update both
  `.witness/current-state.md` and the active session file
  `.witness/sessions/<activeSessionId>.md`.
- The active session record guidance asks for goal / vertical slice, files touched, implementation
  outcome, decisions made, validation run and result, open risks / unresolved work, and next safe
  step.
- The decision-note Save Progress option is memory-first and ADR-second: capture the decision in
  current-state and the active session first; create an ADR candidate only if stable and
  developer-approved.
- The cheatsheet now states that after finishing work, Save Progress should update current project
  memory, active session record, checkpoint/progress information, and confirmed important decisions,
  then Check Memory Update validates.

Counts remain unchanged: 9 contributed commands, 41 activation events, 40 public command
registrations, 0 runtime dependencies.

---

## 11b. v9.8.1 - Save Progress Memory Loop Release Fix

**Status:** Complete. This release-blocking UX fix keeps v9.8 behavior intact while making the
post-work memory loop visible and guided.

Live testing showed that `Save progress + update project memory` could leave users seeing only the
checkpoint/snapshot notification. Save Progress now runs the checkpoint, announces that the
memory-update prompt is opening, opens the prompt directly in a Markdown editor tab, and only then
offers `Witness: Check Memory Update`.

`Witness: Check Memory Update` now recommends the usual files before falling back to manual path
entry:

- `.witness/current-state.md`
- `.witness/sessions/<activeSessionId>.md` when an active session exists
- latest checkpoint/snapshot
- recent or dirty `.witness/*.md` files

Cheatsheet wording now says: after your coding agent updates `.witness/`, run
`Witness: Check Memory Update`. Witness will recommend the usual files to check; use manual
selection only if needed.

Counts remain unchanged: 9 contributed commands, 41 activation events, 40 public command
registrations, 0 runtime dependencies.

---

## 11c. v9.9 - Witness Project Folder Migration

**Status:** Complete. v9.9 adds a safe upgrade path for projects that already contain an older
`.witness/` folder.

When `Witness: Start` sees an existing `.witness/` folder with legacy or missing support files, it
asks whether to upgrade safe Witness support files before starting. `Upgrade and Start` refreshes
support/template/harness files and writes `.witness/version.json`, then continues the existing Start
flow. `Start Without Upgrade` continues without modifying files. `Cancel` stops.

Migration writes or refreshes:

- `.witness/version.json`
- support docs such as `CHEATSHEET.md`, `AGENTS.md`, `commands.md`, `constitution.md`, and
  `index.md`
- `.witness/templates/*`
- `.witness/harness/*`

Migration does not overwrite project memory artifacts:

- `.witness/current-state.md`
- `.witness/sessions/*.md`
- `.witness/decisions/*.md`
- `.witness/checkpoints/*.md`

Counts remain unchanged: 9 contributed commands, 41 activation events, 40 public command
registrations, 0 runtime dependencies.

---

## 12. Non-Goals

v9 must not include:

- Code graph.
- Context lifecycle OS.
- Automatic memory consolidation worker.
- Direct LLM API integration.
- MCP server.
- Marketplace polish.
- Webview dashboard.
- Automatic source-code modification.
- Automatic prompt injection.
- Hidden transcript capture.
- Hidden reasoning capture.
- Removing advanced command handlers.
- Full ADR automation.
- Semantic validation of project architecture.

---

## 13. v9 Milestones

Use this sequence:

| Milestone | Name | Expected scope |
|---|---|---|
| v9.0 | Guided Save Progress + Hidden Advanced Surface Plan | Create this plan only |
| v9.1 | Hide Advanced Commands from Command Palette | Adjust contributed command surface while preserving handlers |
| v9.2 | Post-Start Tracking State | Refine status label logic after Start |
| v9.3 | Save Progress Guided Flow | Make Save Progress the guided post-work entry point |
| v9.4 | `current-state.md` Placeholder Guidance | Update template and maintenance prompt guidance |
| v9.5 | Start Prompt Ending | Clarify coding-agent and user next steps after Start |
| v9.6 | Save Progress / Memory Validation UX | Clarify Update Memory vs Check Memory Update loop |
| v9.7 | Validation Report and Closeout | Validate, document, and close v9 |

Recommended implementation order is the milestone order above. The command-surface work should
come before guided Save Progress so the visible UI already reflects the intended mental model when
the Save Progress behavior changes.

---

## 14. Open Questions

Q1. Can commands remain registered but not contributed in `package.json` and still be callable
internally?

Q2. Which commands should remain visible in Command Palette?

Q3. Should hidden advanced commands still appear in status bar More Actions?

Q4. Should Save Progress replace `createCheckpoint` behavior or wrap it?

Q5. Should Save Progress call Update Memory automatically or ask first?

Q6. Should Save Progress always create a checkpoint?

Q7. How should Witness detect meaningful work after Start?

Q8. Should non-git workspaces use file watcher evidence or session age?

Q9. Should `current-state.md` placeholder presence lower trust score?

Q10. Should architecture decisions be captured in `current-state.md` or checkpoints first, with ADR
creation only on explicit confirmation?

Q11. Should Check Memory Update be offered as a notification action after Update Memory?

Q12. Should old workflow aliases remain activation events if they are hidden from
`contributes.commands`?

Q13. Should `.witness/commands.md` be generated as the canonical advanced command directory after
Command Palette hiding?

---

## 15. Validation Plan

v9 validation should include:

- Compile check: `npm run compile`.
- Command count check.
- Activation event count check.
- Public `registerCommand` count check.
- Runtime dependency check.
- Command Palette visibility test.
- Status bar visibility test.
- Fresh project Start flow test.
- Post-start Tracking label test.
- Save Progress guided flow test.
- `current-state.md` placeholder guidance test.
- Update Memory -> Check Memory Update loop test.
- No automatic injection test.
- No LLM call test.
- No automatic source-code modification test.
- Advanced command preservation test.

Suggested mechanical checks:

```sh
npm run compile
node -e "const p=require('./package.json'); console.log(p.contributes.commands.length)"
node -e "const p=require('./package.json'); console.log(p.activationEvents.length)"
rg \"registerCommand\\(\" src/extension.ts
npm ls --depth=0 --omit=dev
```

Manual validation should use a fresh sample project because v9 is based on live first-use friction.
The validation report should record exact commands tested, expected behavior, actual behavior, and
any remaining UX ambiguity.

---

## 16. v9.0 Constraints

v9.0 is this plan only.

Do not change source code in v9.0.
Do not modify `package.json` in v9.0.
Do not modify `src/extension.ts` in v9.0.
Do not add commands in v9.0.
Do not add dependencies in v9.0.
Do not change README in v9.0.
Do not change status bar behavior in v9.0.

After creating this plan:

1. Run `npm run compile`.
2. Report changed files.
3. Summarize the recommended v9 implementation sequence.
4. Mention open design questions.
