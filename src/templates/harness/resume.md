# Witness Harness Contract — Resume with Witness

This is a strict agent-facing contract. Follow it exactly when you are asked
to prepare a resume summary or resume prompt as part of an artifact-maintenance task.

---

## Purpose

This contract governs the resume orientation task.

When a developer or agent starts or rejoins a work session, the first step is to
orient accurately: understand what the current goal is, what was last completed,
what risks are open, and what the next recommended action is. This contract
produces that orientation summary.

The resume task is read-only by default. Its output is a structured summary for
the developer to review, not a file write. Do not edit any `.witness/` file during
this task unless the developer explicitly instructs you to do so after reviewing
the summary.

Follow this contract when:
- The Witness trigger engine recommends "Start tracking or resume with Witness."
- The developer asks you to load Witness context before starting work.
- No active session is present and the developer wants to orient before coding.

---

## Inputs to Read

Read the following files, in order, before drafting the resume summary.
Do not read files outside this list unless the developer explicitly asks.

1. `.witness/AGENTS.md` — agent protocol and constraints for this project.
2. `.witness/index.md` — the top-level Witness index for this project.
3. `.witness/current-state.md` — the current project-memory summary.
4. `.witness/handovers/latest.md` — the most recent handover.
5. The most recent reviewed context packet, if the developer provides one.
6. `.witness/sessions/<active-session-id>.md` — the active session file, if one exists.

Do not load all session files, all ADRs, or all subagent ledger entries by default.
Do not read telemetry files unless explicitly asked.

If the handover and `current-state.md` conflict on any point, note the conflict
in the Questions Before Editing section. Do not resolve the conflict unilaterally.

---

## Evidence to Collect

Before drafting the resume summary, observe and record:

1. The current goal — from the handover, session file, or current-state. State the source.
2. The most recently completed work — the last confirmed finished task.
3. Open risks — all unresolved risks in the current state.
4. Relevant artifacts — context packets, ADRs, or subagent entries that are immediately
   relevant to resuming work (do not list everything, only what is directly relevant).
5. Conflicts or gaps — any contradiction between files that requires developer clarification.

---

## Allowed Writes

By default, this task produces no file writes.

Write to `.witness/` files only if the developer explicitly instructs you to do so
after reviewing the resume summary. If instructed to write, follow the appropriate
artifact-maintenance contract for that write (`current-state.md`, `checkpoint.md`,
or `handover.md`).

---

## Forbidden Actions

- Do not modify application source code.
- Do not edit package/config files unless explicitly instructed.
- Do not delete previous Witness artifacts.
- Do not claim tests passed unless test output exists.
- Stop for human review after drafting the artifact.
- Do not begin editing source files immediately after the resume summary.
  Wait for the developer to confirm the next action.
- Do not resolve conflicts between files unilaterally — report them and ask.
- Do not load raw telemetry unless explicitly asked.
- Do not scan all `.witness/` files by default — use only the listed read set.

---

## Required Output Sections

The resume summary must contain all of the following sections,
each as a markdown heading (## or ###):

1. Current Goal
2. Completed Work
3. Open Risks
4. Relevant Artifacts
5. Next Recommended Action
6. Questions Before Editing

If a section cannot be filled confidently from the evidence, write what is known
and note the gap. Do not leave a required section blank.

The Questions Before Editing section must always be present.
Use it to surface any conflicts, gaps, or decisions that require developer input
before coding begins. If no questions exist, write "None — state looks consistent."

---

## Completion Checklist

Before presenting the summary for review, confirm:

- [ ] All six required sections are present.
- [ ] Current Goal states the goal and its source file.
- [ ] Completed Work describes the last confirmed finished task.
- [ ] Open Risks lists every unresolved risk — none omitted.
- [ ] Relevant Artifacts lists only artifacts immediately relevant to resuming,
      not a complete inventory of `.witness/`.
- [ ] Next Recommended Action is one specific, concrete step.
- [ ] Questions Before Editing surfaces all conflicts and gaps that need developer input.
- [ ] No source files were modified.
- [ ] No `.witness/` files were written unless explicitly instructed by the developer.

---

## Human Review Note

Present the resume summary to the developer and stop.
Do not proceed to source-code changes until the developer confirms the next action.
Do not treat the summary as a plan to execute — it is a briefing for the developer.
If the developer requests changes or corrections, revise and re-present before proceeding.
