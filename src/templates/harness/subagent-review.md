# Witness Harness Contract — Review Subagent Artifacts

This is a strict agent-facing contract. Follow it exactly when you are asked
to draft review notes for a subagent's work as part of an artifact-maintenance task.

---

## Purpose

This contract governs the drafting of review notes for a subagent ledger entry.

When a subagent completes a delegated task, the orchestrator and developer must
review the output before it is trusted, integrated, or referenced downstream.
This contract guides you through reading the subagent's artifacts, checking them
against the acceptance criteria in the contract, and drafting a structured review.

You may draft review content. You must not approve or reject the work on behalf
of the developer. The developer makes the final review decision.

Follow this contract when:
- The Witness trigger engine recommends "Review Subagent Artifacts."
- The developer asks you to inspect pending subagent ledger entries.
- A subagent's `report.md` is present but `review.md` has not yet been written.

---

## Inputs to Read

Read the following files, in order, before drafting the review.
Limit your read set to the specific subagent entry being reviewed.
Do not read other subagent entries unless the developer explicitly asks.

1. `.witness/AGENTS.md` — agent protocol and constraints for this project.
2. `.witness/subagents/<entry>/contract.md` — the acceptance criteria and task scope.
3. `.witness/subagents/<entry>/context-packet.md` — the context provided to the subagent,
   if present.
4. `.witness/subagents/<entry>/evidence.md` — the evidence the subagent recorded,
   if present.
5. `.witness/subagents/<entry>/report.md` — the subagent's completion report.
6. `.witness/sessions/<active-session-id>.md` — the active session file, for context,
   if one exists.

If any of these files is missing, record the absence as a finding.
A missing `report.md` means the task is not complete; note this and do not proceed
with a review until `report.md` exists.

---

## Evidence to Collect

Before drafting the review, observe and record:

1. The acceptance criteria from `contract.md` — what the subagent was expected to deliver.
2. Whether each acceptance criterion is met, partially met, or not met — based on
   `report.md` and `evidence.md` only. Do not infer completion from code diffs or
   general project state.
3. Any risks introduced by the subagent's work — new dependencies, untested paths,
   deferred items, or open questions.
4. Whether test output exists — from `evidence.md` or `report.md`. Do not claim
   tests passed unless test output is present.
5. Any gaps in the subagent's artifacts — missing sections, missing evidence,
   or claims made without supporting output.

---

## Allowed Writes

You may write only to:

1. `.witness/subagents/<entry>/review.md` — the review file for the specific entry
   being reviewed, and only when the developer explicitly instructs you to write it.

By default this task is read-only — you produce a draft for developer inspection,
not a written file.
No other file may be created, modified, or deleted in this task.

---

## Forbidden Actions

- Do not modify application source code.
- Do not edit package/config files unless explicitly instructed.
- Do not delete previous Witness artifacts.
- Do not claim tests passed unless test output exists.
- Stop for human review after drafting the artifact.
- Do not modify `contract.md` or `report.md` — they are read-only in this task.
- Do not write `review.md` until the developer explicitly approves the draft.
- Do not approve or reject the subagent's work on behalf of the developer.
  Your role is to draft the review; the developer makes the final decision.
- Do not write to subagent entries not being reviewed in this task.
- Do not write to `.witness/sessions/`, `.witness/handovers/`, `.witness/telemetry/`,
  or any file not listed under Allowed Writes.

---

## Required Output Sections

The review draft must contain all of the following sections,
each as a markdown heading (## or ###):

1. Reviewed Subagent
2. Evidence Checked
3. Findings
4. Integration Risk
5. Recommended Decision
6. Uncertainty

The Recommended Decision section must offer one of: accept / reject / revise.
Include a rationale for the recommendation. Make clear that this is a draft
recommendation for the developer's consideration, not a final decision.

If a section cannot be filled confidently from the evidence, write what is known
and note the gap. Do not leave a required section blank.

---

## Completion Checklist

Before presenting the draft for review, confirm:

- [ ] All six required sections are present.
- [ ] Reviewed Subagent identifies the entry path and task description.
- [ ] Evidence Checked lists every artifact file read and notes any that were missing.
- [ ] Findings covers each acceptance criterion from `contract.md` individually.
- [ ] Integration Risk identifies any new risks introduced by the subagent's work.
- [ ] Recommended Decision is one of: accept / reject / revise, with a rationale.
- [ ] Uncertainty notes gaps, missing evidence, and inferences explicitly.
- [ ] Test results are cited from `evidence.md` or `report.md` only — no assumptions.
- [ ] No source files were modified.
- [ ] `review.md` was not written without developer approval.
- [ ] No files outside the Allowed Writes list were written.

---

## Human Review Note

Present the review draft to the developer and stop.
You may draft review content but you must not approve or reject the subagent's work
on behalf of the developer. The developer makes the final review decision.
Do not write `review.md` until the developer explicitly approves the draft and
instructs you to write it.
If the developer requests changes, revise and re-present before writing.
