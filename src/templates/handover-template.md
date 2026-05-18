# Handover: {{HANDOVER_ID}}

This document is the primary artifact for resuming work in a fresh Copilot session. A fresh
session should read this file after reading `constitution.md` and `current-state.md`. If the
resume probe linked at the bottom of this document has not been passed, this handover is not
validated — do not resume complex work until it is.

A handover is not a session log. It is a compressed, forward-looking summary of everything a
fresh session needs to know to take the next safe step. Every entry here should earn its place.

---

## Handover ID

{{HANDOVER_ID}}
<!-- Format: handover-YYYY-MM-DD-NNN, e.g. handover-2026-05-12-001 -->

## From Session

{{SESSION_ID}}
<!-- The session that produced this handover -->

## Generated At

{{YYYY-MM-DDTHH:MM:SSZ}}

---

## Risk Assessment At Time Of Handover

Evaluate each dimension using the vocabulary from `constitution.md`.

| Dimension | Level | Rationale |
|-----------|-------|-----------|
| Active Context Pressure | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |
| Artifact Externalization Gap | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |
| Subagent Boundary Risk | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |
| Quality Drift | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |
| Phase Boundary Risk | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{one-line rationale}} |

## Recommended Risk Level

**{{GREEN / YELLOW / ORANGE / RED / BLOCKED}}**

<!-- Explain the overall level in one or two sentences. If BLOCKED, state the specific condition
     that must be resolved before resuming. -->

{{RISK_LEVEL_EXPLANATION}}

---

## Project Snapshot

<!-- Summarize the project state at the moment of this handover. This is a compressed version
     of current-state.md — include only what is needed for the next step. -->

**Project**: {{PROJECT_NAME}}

**Current phase**: {{CURRENT_PHASE}}

**Active slice / feature**: {{ACTIVE_SLICE_OR_FEATURE}}

**Key constraints in effect**:
- {{CONSTRAINT_1}}
- {{CONSTRAINT_2}}

---

## Files In Flight

<!-- List any files that are mid-edit, partially applied, or in an inconsistent state at the
     time of this handover. A fresh session must read these carefully before modifying them. -->

| File | State | What The Fresh Session Needs To Know |
|------|-------|--------------------------------------|
| {{FILE_PATH}} | {{mid-edit / partially applied / review-needed}} | {{specific note}} |

If no files are in flight, write: "None — all files are in a consistent state."

---

## Pending Decisions

<!-- List any open decisions that have not been resolved. A fresh session should not make these
     decisions unilaterally — they should be surfaced for human review first. -->

| Decision | Context | Urgency |
|----------|---------|---------|
| {{DECISION}} | {{why it is unresolved}} | {{high / medium / low}} |

If no decisions are pending, write: "None."

---

## Last Validation Result

**Validation type**: {{unit tests / integration tests / build / lint / none}}

**Result**: {{passed / failed / partial / not run}}

**Failures or notes**: {{list any failures, or "none"}}

**Last validated at**: {{YYYY-MM-DDTHH:MM:SSZ}}

---

## Next Safe Step For Fresh Session

<!-- This is the most important entry in the handover. State exactly what a fresh session should
     do first. Be specific enough that there is no ambiguity. -->

{{NEXT_SAFE_STEP}}

---

## What Not To Do

<!-- Explicit prohibitions for a fresh session. List things that look correct but are wrong
     given the current state of the project. -->

- Do not {{PROHIBITED_ACTION_1}} because {{REASON}}
- Do not {{PROHIBITED_ACTION_2}} because {{REASON}}

---

## Links

**ADRs relevant to next step**:
- [ADR-{{NNN}}: {{title}}](../decisions/ADR-{{NNN}}-{{slug}}.md)

**Subagent reports from this session**:
- [{{SUBAGENT_ID}}](../subagents/{{SUBAGENT_ID}}.md)

**Session record**:
- [{{SESSION_ID}}](../sessions/{{SESSION_FILE}}.md)

**Resume probe** (must be passed before this handover is considered validated):
- [resume-probe-{{SESSION_ID}}](../evaluation/resume-probe-{{SESSION_ID}}.md)
