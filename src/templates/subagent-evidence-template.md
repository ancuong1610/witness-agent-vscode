# Subagent Evidence: {{SUBAGENT_ID}}

Fill in this file immediately after the subagent completes its task, while the details are still
fresh. The evidence record is the primary audit trail used during orchestrator review.

RULE: Record what actually happened, not what was intended. If the subagent deviated from the
contract, record the deviation accurately. Do not redact or omit actions that were later reversed.

---

## Subagent ID

{{SUBAGENT_ID}}

## Parent Session

{{SESSION_ID}}

## Recorded At

{{YYYY-MM-DDTHH:MM:SSZ}}

---

## Files Inspected

<!-- List every file or artifact the subagent read or examined, even if no changes resulted. -->

| Path | Notes |
|------|-------|
| {{FILE_PATH}} | {{what was found or why it was inspected}} |

---

## Files Modified

<!-- List every file the subagent created, modified, or deleted. -->

| Path | Change Type | Notes |
|------|-------------|-------|
| {{FILE_PATH}} | {{created / modified / deleted}} | {{what was changed and why}} |

---

## Actions Taken

<!-- Describe the sequence of actions the subagent took to complete the task. This is a
     narrative of execution, not a list of intent. -->

{{ACTIONS_TAKEN}}

---

## Decisions Made During Execution

<!-- Record any decision the subagent made that was not pre-specified in the contract.
     These may need to be escalated to ADRs during review. -->

| Decision | Rationale | Escalation Needed? |
|----------|-----------|--------------------|
| {{DECISION}} | {{why this was decided}} | {{yes / no}} |

---

## Deviations from Contract

<!-- Record any instance where the subagent acted outside the scope or acceptance criteria
     defined in the contract. Explain what happened and why. -->

{{DEVIATIONS}}
<!-- If none: "None. Execution matched the contract." -->

---

## Verification Output

<!-- Paste or summarize any test output, lint results, compile results, or other verification
     that was run to confirm the task was completed correctly. -->

{{VERIFICATION_OUTPUT}}

---

## Assumptions Made

<!-- List any assumptions the subagent made that were not explicit in the contract or context
     packet. These should be validated during review. -->

- {{ASSUMPTION_1}}

---

## Open Questions

<!-- List any questions or unresolved issues that arose during execution and require orchestrator
     attention. -->

- {{OPEN_QUESTION_1}}
