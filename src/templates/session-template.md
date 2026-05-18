# Session Record

Copy this template to `sessions/YYYY-MM-DD-<id>.md` and fill in the fields as the session
progresses. Update "Files Touched" and "Decisions Made" incrementally during the session — do
not try to reconstruct them at the end from memory.

---

## Session ID

{{SESSION_ID}}
<!-- Format: YYYY-MM-DD-NNN, e.g. 2026-05-12-001 -->

## Started At

{{YYYY-MM-DDTHH:MM:SSZ}}

## Ended At

{{YYYY-MM-DDTHH:MM:SSZ}}
<!-- Leave blank until the session ends -->

---

## Goal

<!-- One or two sentences: what was this session trying to accomplish? -->

{{SESSION_GOAL}}

## Vertical Slice

<!-- Which feature, module, or work unit did this session address? -->

{{VERTICAL_SLICE}}

---

## Files Touched

<!-- List every file meaningfully read or modified during this session. Include a brief note on
     what changed or why it was read. Add rows incrementally as the session proceeds. -->

| File | Change Type | Notes |
|------|-------------|-------|
| {{FILE_PATH}} | {{created/modified/deleted/read}} | {{brief note}} |

---

## Decisions Made

<!-- Any architectural or design decisions made during this session. Link to ADRs in decisions/. -->

| Decision | ADR Link | Notes |
|----------|----------|-------|
| {{DECISION_SUMMARY}} | decisions/ADR-{{NNN}}-{{slug}}.md | {{context}} |

---

## Subagents Invoked

<!-- List any subagent delegations made during this session. Link to subagent records in subagents/. -->

| Subagent ID | Task | Record Link |
|-------------|------|-------------|
| {{SUBAGENT_ID}} | {{task}} | subagents/{{SUBAGENT_ID}}.md |

---

## Validation Run

<!-- Did validation (tests, lint, build) run during this session? What was the result? -->

**Validation type**: {{unit tests / integration tests / build / lint / none}}

**Result**: {{passed / failed / partial / not run}}

**Notes**: {{any failures or skipped suites}}

---

## Outcome

<!-- Was the session goal achieved? What was left incomplete? -->

{{SESSION_OUTCOME}}

---

## Risk At End

<!-- Assess continuity risk at the end of this session using the five dimensions from
     constitution.md. Record the overall level: GREEN / YELLOW / ORANGE / RED / BLOCKED -->

| Dimension | Level | Notes |
|-----------|-------|-------|
| Active Context Pressure | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{notes}} |
| Artifact Externalization Gap | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{notes}} |
| Subagent Boundary Risk | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{notes}} |
| Quality Drift | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{notes}} |
| Phase Boundary Risk | {{GREEN/YELLOW/ORANGE/RED/BLOCKED}} | {{notes}} |

**Overall Risk Level**: {{GREEN / YELLOW / ORANGE / RED / BLOCKED}}

---

## Handover Generated

**Yes / No / In Progress**: {{answer}}

**Handover file**: handovers/handover-{{SESSION_ID}}.md
<!-- Leave blank if no handover was generated -->
