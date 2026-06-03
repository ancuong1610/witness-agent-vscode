# Witness Harness Contract — Update current-state.md

This is a strict agent-facing contract. Follow it exactly when you are asked
to update `.witness/current-state.md` as part of an artifact-maintenance task.

---

## Purpose

This contract governs updates to `.witness/current-state.md`.

`current-state.md` is the live project-memory summary for this repository.
It records the active goal, the latest completed work, open risks, and the
next safe action. It is the first file a coding agent or developer should
read when resuming work.

Follow this contract when:
- The Witness trigger engine recommends "Update Project Memory."
- The developer asks you to update the current state.
- `current-state.md` is missing or visibly out of date.

---

## Inputs to Read

Read the following files, in order, before drafting the update.
Do not read files outside this list unless the developer explicitly asks.

1. `.witness/AGENTS.md` — agent protocol and constraints for this project.
2. `.witness/current-state.md` — existing content to update (may be stale or missing).
3. `.witness/sessions/<active-session-id>.md` — the active session file, if one exists.
4. `.witness/handovers/latest.md` — most recent handover, if present and relevant.

If the active session ID is not known, ask the developer before proceeding.

---

## Evidence to Collect

Before drafting the update, observe and record:

1. The current goal — stated in the active session file or handover.
2. The most recently completed task — explicitly finished, not assumed.
3. Any open risks — listed in the handover, session file, or prior current-state.
4. The next safe action — the most specific, concrete next step you can identify.
5. Any conflicts between the session file, handover, and prior current-state.
   If conflicts exist, note them as uncertainty rather than resolving them silently.

If any evidence item is unavailable, record it explicitly as unknown or uncertain.

## Placeholder Rules

- Replace obvious placeholders only with confirmed project files or developer-provided facts.
- Do not invent project purpose, architecture, stack, or status.
- If uncertain, write `Unknown` or `To be confirmed`.
- Record files changed, implementation outcome, validation results, and next safe step.
- Update the active session file only if the Save Progress flow explicitly asks for it.
- Mention remaining uncertainty.

---

## Allowed Writes

You may write only to:

1. `.witness/current-state.md`
2. `.witness/sessions/<active-session-id>.md` only if the Save Progress flow explicitly asks you
   to update the active session record.

No other file may be created, modified, or deleted in this task.

---

## Forbidden Actions

- Do not modify application source code.
- Do not edit package/config files unless explicitly instructed.
- Do not delete previous Witness artifacts.
- Do not claim tests passed unless test output exists.
- Stop for human review after drafting the artifact.
- Do not write to `.witness/handovers/`, `.witness/subagents/`, `.witness/telemetry/`, or any file
  outside the allowed current-state and explicitly requested active session files.
- Do not infer a goal, risk, or next action that is not present in the evidence.
  If the evidence is insufficient, say so in the Uncertainty section.

---

## Required Output Sections

The updated `current-state.md` must contain all of the following sections,
each as a markdown heading (## or ###):

1. Current Goal
2. Latest Progress
3. Open Risks
4. Next Safe Action
5. Evidence Used
6. Uncertainty

If a section cannot be filled confidently from the evidence, write what is
known and note the gap. Do not leave a required section blank.

---

## Completion Checklist

Before presenting the draft for review, confirm:

- [ ] All six required sections are present.
- [ ] Current Goal is drawn directly from the session file or developer instruction.
- [ ] Latest Progress describes only verifiably completed work, not assumed work.
- [ ] Open Risks lists only risks that are currently unresolved.
- [ ] Next Safe Action is one specific, concrete step — not a vague direction.
- [ ] Evidence Used names the files you read and the facts you extracted from them.
- [ ] Uncertainty notes any gaps, conflicts, or inferences explicitly.
- [ ] No source files were modified.
- [ ] No files outside `.witness/current-state.md` and any explicitly requested active session file
      were written.

---

## Human Review Note

Present the draft `current-state.md` to the developer and stop.
Do not write the file until the developer explicitly approves the draft.
Do not treat your own output as approved.
If the developer requests changes, revise and re-present before writing.
