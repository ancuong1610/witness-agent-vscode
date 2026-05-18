# Subagent Contract: {{SUBAGENT_ID}}

Fill in this contract before dispatching the subagent. The contract defines exactly what the
subagent is asked to do, what constitutes a successful result, what it may and may not touch,
and what evidence it must produce.

RULE: Do not dispatch a subagent without a completed contract. An undocumented delegation cannot
be reviewed, integrated, or audited — its outputs carry no continuity guarantee.

---

## Subagent ID

{{SUBAGENT_ID}}
<!-- Format: subagent-NNN -->

## Parent Session

{{SESSION_ID}}
<!-- The session ID that is dispatching this subagent -->

## Created At

{{YYYY-MM-DDTHH:MM:SSZ}}

## Status

OPEN

---

## Task Goal

<!-- State the specific, bounded task this subagent is being asked to accomplish. Be precise
     enough that the subagent can determine when the task is complete without asking. -->

{{TASK_GOAL}}

---

## Acceptance Criteria

<!-- List the criteria that must all be true for this task to be considered complete.
     Each criterion should be independently verifiable. -->

- [ ] {{CRITERION_1}}
- [ ] {{CRITERION_2}}

---

## Scope Constraints

<!-- Describe what is in scope and what is explicitly out of scope. The subagent should not
     expand scope without returning to the orchestrator first. -->

**In scope**:

- {{IN_SCOPE_1}}

**Out of scope**:

- {{OUT_OF_SCOPE_1}}

---

## Allowed Context

<!-- List the files, artifacts, and context items the subagent is permitted to read or use.
     Keep this minimal — context not listed here should not be consulted. -->

| Item | Type | Purpose |
|------|------|---------|
| {{ITEM}} | {{file / artifact / instruction}} | {{why it is needed}} |

---

## Do Not Touch

<!-- List files, directories, or artifacts the subagent must not modify, even if they appear
     relevant to the task. -->

- {{DO_NOT_TOUCH_1}}

---

## Expected Evidence

<!-- Describe what the subagent must record in its evidence file after completing the task.
     This forms the audit trail used during review. -->

{{EXPECTED_EVIDENCE}}

---

## Dispatch Notes

<!-- Any additional context, constraints, or instructions that do not fit the categories above.
     Also use this section to record why this task was delegated rather than handled directly. -->

{{DISPATCH_NOTES}}
