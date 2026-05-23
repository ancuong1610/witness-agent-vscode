# Witness Harness Contract — Prepare Handover

This is a strict agent-facing contract. Follow it exactly when you are asked
to prepare a handover document as part of an artifact-maintenance task.

---

## Purpose

This contract governs the creation of a handover document in `.witness/handovers/`.

A handover is a structured summary that allows the next session, agent, or developer
to resume work accurately without needing to reconstruct context from scattered files.
It records what was accomplished, what the current state is, what risks remain open,
and what the next steps are, along with explicit resume instructions.

A handover must be accurate and conservative. It must not claim more progress than
the evidence supports. It must not omit open risks to make the handover look cleaner.

Follow this contract when:
- The Witness trigger engine recommends "Prepare Handover."
- The developer is ending a work block or preparing for a context switch.
- The latest handover is stale or missing.
- Risk level is ORANGE, RED, or BLOCKED and continuity must be preserved.

---

## Inputs to Read

Read the following files, in order, before drafting the handover.
Do not read files outside this list unless the developer explicitly asks.

1. `.witness/AGENTS.md` — agent protocol and constraints for this project.
2. `.witness/current-state.md` — the current project-memory summary.
3. `.witness/sessions/<active-session-id>.md` — the active session file, if one exists.
4. `.witness/handovers/latest.md` — the previous handover, for continuity context.
5. The most recent risk assessment file, if referenced in `current-state.md`.
6. Relevant subagent reports, if referenced in `current-state.md` or the session file.

If the active session ID is not known, ask the developer before proceeding.

---

## Evidence to Collect

Before drafting the handover, observe and record:

1. The session goal — from the active session file or developer instruction.
2. Completed work — explicitly finished tasks. Do not include assumed or in-progress work.
3. Incomplete work — tasks started but not finished; clearly marked as incomplete.
4. Open risks — all unresolved risks from the current-state, session file, or risk assessment.
5. Subagent states — any pending, blocked, or completed subagent ledger entries.
6. The recommended next step — one concrete action for the next session to take first.
7. Any conflicts between the session file, current-state, and prior handover.
   Record conflicts as uncertainty rather than resolving them silently.

---

## Allowed Writes

You may write only to:

1. `.witness/handovers/YYYY-MM-DD-HH-MM.md` — the new timestamped handover file.
2. `.witness/handovers/latest.md` — updated to reference the new handover file.

Do not modify or delete prior handover files.
No other file may be created, modified, or deleted in this task.

---

## Forbidden Actions

- Do not modify application source code.
- Do not edit package/config files unless explicitly instructed.
- Do not delete previous Witness artifacts.
- Do not claim tests passed unless test output exists.
- Stop for human review after drafting the artifact.
- Do not write to `.witness/sessions/`, `.witness/subagents/`, `.witness/telemetry/`,
  or any file not listed under Allowed Writes.
- Do not modify or delete prior handover files (only `latest.md` pointer may be updated).
- Do not mark open risks as resolved unless the developer has confirmed resolution.
- Do not speculate about what will be done next — describe what is known and confirmed.

---

## Required Output Sections

The handover file must contain all of the following sections,
each as a markdown heading (## or ###):

1. Session Summary
2. Completed Work
3. Current State
4. Open Risks
5. Next Steps
6. Resume Instructions
7. Evidence Used
8. Uncertainty

If a section cannot be filled confidently from the evidence, write what is
known and note the gap. Do not leave a required section blank.

---

## Completion Checklist

Before presenting the draft for review, confirm:

- [ ] All eight required sections are present.
- [ ] Session Summary describes the work block in plain language.
- [ ] Completed Work lists only explicitly finished tasks.
- [ ] Current State reflects the most recent `current-state.md` content accurately.
- [ ] Open Risks lists every unresolved risk — none omitted.
- [ ] Next Steps names at least one specific, concrete next action.
- [ ] Resume Instructions are complete enough for a new agent to orient without
      reading every `.witness/` file from scratch.
- [ ] Evidence Used names the files read and facts extracted.
- [ ] Uncertainty notes gaps, conflicts, and inferences explicitly.
- [ ] The handover filename follows the YYYY-MM-DD-HH-MM.md format.
- [ ] `latest.md` has been updated to reference the new handover.
- [ ] No source files were modified.
- [ ] No prior handover files were deleted or overwritten.

---

## Human Review Note

Present the draft handover to the developer and stop.
Do not write the handover file or update `latest.md` until the developer
explicitly approves the draft.
Do not treat your own output as approved.
If the developer requests changes, revise and re-present before writing.
