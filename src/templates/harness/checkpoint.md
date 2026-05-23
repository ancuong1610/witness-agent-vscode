# Witness Harness Contract — Create Checkpoint

This is a strict agent-facing contract. Follow it exactly when you are asked
to create a checkpoint file as part of an artifact-maintenance task.

---

## Purpose

This contract governs the creation of a checkpoint file in `.witness/checkpoints/`.

A checkpoint is a factual, point-in-time record of what was completed, what
evidence exists, what files changed, what risks remain open, and what the next
action is. Checkpoints are created before ending a work block, before a context
switch, or when the Witness trigger engine recommends "Create Checkpoint."

A checkpoint must be factual. It must not speculate about work that was not
verifiably completed. It must not resolve risks that are still open.

Follow this contract when:
- The Witness trigger engine recommends "Create Checkpoint."
- The developer asks you to checkpoint before stopping or switching context.
- A significant block of work has been completed and no recent checkpoint exists.

---

## Inputs to Read

Read the following files, in order, before drafting the checkpoint.
Do not read files outside this list unless the developer explicitly asks.

1. `.witness/AGENTS.md` — agent protocol and constraints for this project.
2. `.witness/current-state.md` — the current project-memory summary.
3. `.witness/sessions/<active-session-id>.md` — the active session file, if one exists.
4. `git status` / `git diff --stat` output — if provided by the developer in this session.
5. Any evidence files or risk assessments referenced in the current-state.

If the active session ID is not known, ask the developer before proceeding.

---

## Evidence to Collect

Before drafting the checkpoint, observe and record:

1. What was completed in this work block — explicitly finished tasks only.
2. Which source files changed — from git output or developer statement. If unavailable, say so.
3. Open risks — from the current-state or session file. Do not mark risks as resolved
   unless you have explicit confirmation that they are resolved.
4. The next action — the most specific, concrete next step from current-state or developer
   instruction. Do not invent a next step if none is provided.
5. Any conflicts or gaps in the evidence — record them in the Uncertainty section.

---

## Allowed Writes

You may write only to:

1. `.witness/checkpoints/` — new checkpoint file only. Use the naming format:
   `.witness/checkpoints/YYYY-MM-DD-HH-MM-<slug>.md`
   where `<slug>` is a short lowercase description of the work captured.
   Do not overwrite an existing checkpoint file.
2. `.witness/current-state.md` — only if the developer explicitly requested a
   current-state update as part of this checkpoint task.

No other file may be created, modified, or deleted in this task.

---

## Forbidden Actions

- Do not modify application source code.
- Do not edit package/config files unless explicitly instructed.
- Do not delete previous Witness artifacts.
- Do not claim tests passed unless test output exists.
- Stop for human review after drafting the artifact.
- Do not write to `.witness/handovers/`, `.witness/sessions/`, `.witness/subagents/`,
  `.witness/telemetry/`, or any file not listed under Allowed Writes.
- Do not mark risks as resolved unless the developer has confirmed resolution.
- Do not overwrite a previously created checkpoint file.

---

## Required Output Sections

The checkpoint file must contain all of the following sections,
each as a markdown heading (## or ###):

1. Summary
2. Evidence
3. Changed Files
4. Open Risks
5. Next Action
6. Uncertainty

If a section cannot be filled confidently from the evidence, write what is
known and note the gap. Do not leave a required section blank.

---

## Completion Checklist

Before presenting the draft for review, confirm:

- [ ] All six required sections are present.
- [ ] Summary describes the work completed in plain language.
- [ ] Evidence names the specific files, outputs, or statements used as evidence.
- [ ] Changed Files lists files from git output or marks the list as unavailable.
- [ ] Open Risks lists only currently unresolved risks — not previously closed ones.
- [ ] Next Action is one specific, concrete step.
- [ ] Uncertainty notes gaps, inferences, or missing evidence explicitly.
- [ ] The checkpoint filename follows the YYYY-MM-DD-HH-MM-<slug>.md format.
- [ ] No source files were modified.
- [ ] No files outside the Allowed Writes list were written.

---

## Human Review Note

Present the draft checkpoint to the developer and stop.
Do not write the checkpoint file until the developer explicitly approves the draft.
Do not treat your own output as approved.
If the developer requests changes, revise and re-present before writing.
