# Witness Agent v9 Validation Report

**Theme:** Guided Save Progress + Hidden Advanced Surface
**Status:** CLOSED
**Validated:** 2026-06-02

---

## 1. Overview

v9 is Guided Save Progress + Hidden Advanced Surface. It improves the post-work loop and reduces
visible advanced command noise.

The core product change is:

> After meaningful work, run `Witness: Save Progress`.

Witness now guides the user from post-work uncertainty toward checkpointing, memory update,
validation, and resume preparation without asking them to manually choose internal implementation
commands first.

---

## 2. Original live-test issues

- Command Palette showed multiple Start-related commands.
- Start prompt left the user unsure what to do next.
- Status bar showed Save Needed immediately after Start.
- After finishing work, the user was unsure whether to Save Progress, Update Memory, Check Memory
  Update, edit `current-state.md` manually, or create ADR.
- `current-state.md` placeholders looked confusing.
- Advanced commands in Command Palette distracted from the beginner workflow.

---

## 3. Final v9 user model

| State / command | Meaning |
|---|---|
| Start | Begin work |
| Tracking | Active work in progress |
| Save Progress | Preserve what changed and what matters |
| Update Memory | Ask coding agent to update Witness artifacts |
| Check Memory Update | Validate agent-written Witness artifacts |
| Resume | Continue later |
| Switch Task | Move to another task |
| Fix Issue | Resolve warning |

---

## 4. Final counts

| Metric | Final count |
|---|---:|
| `package.json` `contributes.commands` | 9 |
| `package.json` `activationEvents` | 41 |
| `src/extension.ts` `registerCommand` calls | 40 |
| Runtime dependencies | 0 |

`witness.openStatusActions` remains internal only and absent from `package.json`.

Visible contributed commands:

- `Witness: Start`
- `Witness: Status`
- `Witness: Save Progress`
- `Witness: Resume`
- `Witness: Switch Task`
- `Witness: Fix Issue`
- `Witness: Update Memory`
- `Witness: Check Memory Update`
- `Witness: Cheatsheet`

---

## 5. v9.1 Command Palette hiding validation

- Visible contributed commands reduced from 40 to 9.
- Old/internal commands remain registered in `src/extension.ts`.
- Advanced commands remain accessible through status bar More Actions or internal execution after
  activation.
- Typing `Witness: Start` no longer exposes multiple contributed Start variants from
  `package.json`.

Validated by static manifest checks. Manual VS Code Command Palette smoke testing was not run in
this closeout pass.

---

## 6. v9.2 Tracking state validation

Expected label behavior:

- No active session -> `Witness: Start`
- Active fresh session -> `Witness: Tracking`
- Stale current-state only -> `Witness: Tracking`
- Dirty source changes or checkpoint need -> `Witness: Save Needed`
- Subagent review -> `Witness: Review Needed`
- Critical risk -> `Witness: Attention`

Validated by focused status-label checks during v9.2 and compile in this closeout pass.

---

## 7. v9.3 Guided Save Progress validation

- `Witness: Save Progress` is no longer only a `createCheckpoint` alias.
- No active session offers Start.
- Save current progress runs checkpoint.
- Save progress + update project memory runs checkpoint, then update memory.
- Check Memory Update is offered after memory update.
- Architecture/decision flow is memory-first, ADR-second.
- Memory updates are not automatically approved.

Validated by static command checks, pure planner checks, and compile. Manual Save Progress smoke
testing was not run in this closeout pass.

---

## 8. v9.4 current-state placeholder guidance validation

- `current-state.md` template has a New project note.
- Placeholders are explained as expected template scaffolding.
- Save Progress / Check Memory Update path is explained.
- Coding-agent guidance says not to invent facts.
- `Unknown` and `To be confirmed` are allowed when evidence is incomplete.

Validated by static template and prompt checks.

---

## 9. v9.5 Start prompt ending validation

- Generated Start prompt ends with `After reading context`.
- Coding agent is instructed to summarize current project state.
- Coding agent is instructed to propose the next coding plan.
- Developer approval or adjustment is required before source edits.
- After implementation, the agent reminds the developer to run `Witness: Save Progress`.
- Agent is told not to update `.witness/` unless asked to save progress or update memory.

Validated by generated-prompt static checks.

---

## 10. v9.6 Memory validation UX validation

- Update Memory tells user to run Check Memory Update after `.witness/` edits.
- Check Memory Update says it validates existing `.witness/` changes.
- Validation result wording does not imply updating memory.
- Status bar refreshes after validation completes.
- Cheatsheet contains the memory-update validation loop.

Validated by static UX checks and compile.

---

## 11. Fresh-project regression checklist

Manual checklist for future VS Code extension-host validation:

- Open new project.
- Run `Witness: Start`.
- Confirm only workflow-first Start appears in Command Palette.
- Confirm generated prompt has clear next step.
- Confirm status shows `Witness: Tracking` after Start.
- Confirm `current-state.md` placeholders are explained.
- Code normally.
- After meaningful work, run `Witness: Save Progress`.
- Confirm Save Progress guides checkpoint/update-memory path.
- Confirm Check Memory Update validates after `.witness/` edits.
- Confirm advanced commands do not distract in Command Palette.

This closeout pass did not run the manual VS Code UI smoke test.

---

## 12. Non-goals preserved

- No LLM calls.
- No direct provider API.
- No automatic prompt injection.
- No automatic source-code modification.
- No automatic approval of memory updates.
- No hidden transcript capture.
- No hidden reasoning capture.
- No advanced command handler deletion.
- No code graph.
- No Context OS.

---

## 13. Known limitations

- Advanced handlers still exist and are reachable through More Actions.
- Command Palette hiding depends on `contributes.commands` being separate from registered commands.
- Save Progress still requires user confirmation and coding-agent prompt paste.
- Witness does not semantically understand architecture decisions without user or agent input.
- No direct coding-agent API integration.
- No automatic current-state semantic filling.
- No Marketplace polish yet.

---

## 14. Final v9 status

v9 is closed.

Validation evidence:

- `npm run compile` passed.
- `package.json` `contributes.commands` = 9.
- `package.json` `activationEvents` = 41.
- `src/extension.ts` `registerCommand` calls = 40.
- Runtime dependencies = 0.
- `witness.openStatusActions` remains absent from `package.json`.

Core v9 principle:

> After meaningful work, run `Witness: Save Progress`.

---

## 15. v9.8 Release-hardening addendum

**Validated:** 2026-06-03

v9.8 addresses one release-blocking live-test gap before packaging 0.3.0: after meaningful work,
the active session file could still look like an untouched template and architecture decisions
could remain uncaptured.

Validation points:

- Session template mentions `Witness: Save Progress`.
- Session template explains that the session starts as a tracking template.
- Session template says Save Progress should update files touched, decisions made, validation
  results, implementation outcome, and next safe step.
- Update-memory prompt includes `.witness/current-state.md`.
- Update-memory prompt includes the active session file
  `.witness/sessions/<activeSessionId>.md`.
- Update-memory prompt asks for goal / vertical slice, files touched, implementation outcome,
  decisions made, validation run and result, open risks / unresolved work, and next safe step.
- Decision capture is memory-first: current-state and active session first, ADR candidate only when
  stable and developer-approved.
- Cheatsheet says Save Progress updates current project memory, active session record,
  progress/checkpoint information, and confirmed important decisions, then Check Memory Update
  validates.

Counts remain unchanged:

- `package.json` `contributes.commands` = 9.
- `package.json` `activationEvents` = 41.
- `src/extension.ts` `registerCommand` calls = 40.
- Runtime dependencies = 0.
- `witness.openStatusActions` remains absent from `package.json`.

Manual fresh-project smoke testing was not run in this addendum pass.

## 16. v9.8.1 Save Progress memory-loop release fix

**Validated:** 2026-06-03

Live testing found that `Save progress + update project memory` could appear to stop after the
checkpoint/snapshot notification. The flow now runs the checkpoint, announces that the
memory-update prompt is opening, opens the prompt directly, and only offers `Witness: Check Memory
Update` after the prompt opens.

Check Memory Update now recommends `.witness/current-state.md`, the active session file when
present, latest checkpoint/snapshot, and recent or dirty Witness markdown files before offering
manual path entry as a fallback.

Cheatsheet wording now tells users that after the coding agent updates `.witness/`, they should run
`Witness: Check Memory Update`; Witness recommends the usual files and manual selection is only
needed as a fallback.

Manual VS Code smoke testing was not run in this addendum pass.

## 17. v9.9 Witness project folder migration

**Validated:** 2026-06-03

v9.9 adds safe migration support for projects with older `.witness/` folders. Missing or stale
`.witness/version.json`, missing support docs, missing harness files, missing template files, and
old current-state/session-template guidance are detected as migration reasons.

`Witness: Start` now asks whether to upgrade safe support files before starting. Upgrade writes or
refreshes support/template/harness files and `.witness/version.json`, then continues the normal
Start flow. Start Without Upgrade continues without modifications. Cancel stops.

Migration does not overwrite `.witness/current-state.md`, `.witness/sessions/*.md`,
`.witness/decisions/*.md`, or `.witness/checkpoints/*.md`.

Manual VS Code smoke testing was not run in this addendum pass.
