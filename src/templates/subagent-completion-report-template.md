# Subagent Completion Report: {{SUBAGENT_ID}}

This file records the outcomes of the subagent task against the acceptance criteria defined in the
contract. Complete this after reviewing the evidence file.

---

## Subagent ID

{{SUBAGENT_ID}}

## Parent Session

{{SESSION_ID}}

## Completed At

{{YYYY-MM-DDTHH:MM:SSZ}}

## Status

{{COMPLETED / PARTIAL / FAILED}}

---

## Outputs Delivered

<!-- List the primary deliverables produced by the subagent. Include file paths, artifact
     references, or descriptions as appropriate. -->

| Output | Path or Description | Quality |
|--------|---------------------|---------|
| {{OUTPUT_NAME}} | {{path or description}} | {{acceptable / needs revision / rejected}} |

---

## Acceptance Criteria Status

<!-- Evaluate each criterion from the contract against the evidence. -->

| Criterion | Status | Notes |
|-----------|--------|-------|
| {{CRITERION_1}} | {{PASS / FAIL / PARTIAL}} | {{notes}} |
| {{CRITERION_2}} | {{PASS / FAIL / PARTIAL}} | {{notes}} |

---

## Evidence Links

<!-- Link to the evidence file and any external artifacts that support the completion claim. -->

- Evidence: `.witness/subagents/{{SUBAGENT_ID}}/evidence.md`
- {{ADDITIONAL_EVIDENCE_LINK}}

---

## Decisions with Continuity Implications

<!-- List decisions made during execution that affect the broader project and may need to be
     promoted to ADRs or reflected in current-state.md. -->

| Decision | Continuity Impact | Action Required |
|----------|------------------|-----------------|
| {{DECISION}} | {{impact description}} | {{promote to ADR / update current-state / none}} |

---

## Known Gaps or Limitations

<!-- Describe any gaps between what was delivered and what was contracted. Include technical
     debt introduced, edge cases not handled, or scope that was deferred. -->

{{KNOWN_GAPS}}
<!-- If none: "None identified." -->

---

## Recommended Follow-up

<!-- List any follow-up tasks, investigations, or subagent invocations that are recommended
     based on the completion results. -->

- {{FOLLOW_UP_1}}
