# Subagent Review: {{SUBAGENT_ID}}

The orchestrator completes this file after inspecting the completion report and evidence. The
review decision determines whether the subagent's outputs are integrated into the main session,
returned for revision, or discarded.

RULE: Do not integrate subagent work into the main session without a completed review. Review is
the boundary control between subagent execution and orchestrator continuity.

---

## Subagent ID

{{SUBAGENT_ID}}

## Parent Session

{{SESSION_ID}}

## Reviewed At

{{YYYY-MM-DDTHH:MM:SSZ}}

---

## Review Decision

**Decision**: {{ACCEPTED / ACCEPTED WITH CONDITIONS / REJECTED}}

<!-- Summarize the basis for this decision in one to three sentences. -->

{{REVIEW_DECISION_RATIONALE}}

---

## Integration Actions

<!-- List every concrete action taken to integrate the subagent outputs into the main session.
     Include file modifications, context updates, and any manual corrections applied. -->

| Action | File or Artifact | Notes |
|--------|-----------------|-------|
| {{ACTION}} | {{path or artifact}} | {{notes}} |

---

## Conditions or Remediation Required

<!-- If the decision is ACCEPTED WITH CONDITIONS or REJECTED, list what must be done before
     integration is complete or before re-dispatch. -->

{{CONDITIONS_OR_REMEDIATION}}
<!-- If none: "None. Integration is unconditional." -->

---

## Residual Risk

<!-- Describe any risk introduced by the subagent's work that was not fully resolved during
     review. This feeds into the next Assess Continuity Risk run. -->

{{RESIDUAL_RISK}}
<!-- If none: "None identified." -->

---

## Promoted to Current State

**Promoted**: {{yes / no}}

<!-- If yes, describe what was added or updated in `.witness/current-state.md`. -->

{{CURRENT_STATE_UPDATES}}

---

## Promoted to ADR

**ADR created**: {{yes / no}}

<!-- If yes, link to the ADR. If no, explain why a decision that has continuity implications
     was not formalized. -->

{{ADR_REFERENCE}}

---

## Final Orchestrator Notes

<!-- Any additional notes about the review, integration quality, subagent performance, or
     lessons learned that should inform future delegations. -->

{{FINAL_NOTES}}
