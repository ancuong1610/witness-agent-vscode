# Subagent Report

Copy this template to `subagents/<subagent-id>.md` and fill it in immediately after the subagent
completes its task. Do not defer this — details about what the subagent did and decided are hard
to reconstruct later and critical for continuity.

RULE: If subagent work affects the result, it must be recorded. A subagent that produced no
output or was abandoned still warrants a brief record noting that it ran and why it was discarded.

---

## Subagent ID

{{SUBAGENT_ID}}
<!-- Format: YYYY-MM-DD-<role>-NNN, e.g. 2026-05-12-builder-001 -->

## Parent Session

{{SESSION_ID}}
<!-- The session ID that invoked this subagent -->

## Model Used

{{MODEL_NAME_AND_VERSION}}
<!-- e.g. "Claude Sonnet 4.6", "GPT-4o", "Copilot (default)" -->

---

## Task Given

<!-- Describe the task delegated to the subagent. Be specific enough that someone reading this
     later can understand exactly what was asked and why. -->

{{TASK_DESCRIPTION}}

---

## Inputs Provided

<!-- List every artifact, file, or context item that was passed to the subagent as input. -->

| Input | Type | Description |
|-------|------|-------------|
| {{INPUT_NAME}} | {{file / snippet / instruction / artifact}} | {{brief description}} |

---

## Outputs Returned

<!-- Record the subagent's outputs in full, or link to a file if the output is large. The key
     rule: if it was produced and used, it lives here. -->

### Summary

{{ONE_PARAGRAPH_SUMMARY_OF_OUTPUT}}

### Full Output or Link

<!-- Either paste the full output here (preferred for small outputs) or link to a file. -->

```
{{FULL_OUTPUT_OR_OMIT_IF_LINKED}}
```

<!-- If the output is in a file: -->
**Output file**: {{path/to/output/file}}

---

## Files Changed By Subagent

<!-- List any files the subagent created, modified, or deleted. -->

| File | Change | Notes |
|------|--------|-------|
| {{FILE_PATH}} | {{created/modified/deleted}} | {{notes}} |

---

## Decisions Made

<!-- Any decisions the subagent made that affect the broader project. Link to ADRs if formal
     decisions were recorded. -->

| Decision | ADR | Notes |
|----------|-----|-------|
| {{DECISION}} | {{ADR link or "none"}} | {{context}} |

---

## Integrated Into Parent Session?

**Status**: {{yes / no / partial}}

<!-- If partial or no, explain what was left out and why. -->

{{INTEGRATION_NOTES}}

---

## Quality Notes

<!-- How good was the subagent output? Anything the parent session had to correct, reject, or
     significantly modify? This is useful calibration data for future delegations. -->

{{QUALITY_ASSESSMENT}}
