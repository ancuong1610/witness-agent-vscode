# Subagent Context Packet: {{SUBAGENT_ID}}

This file records the minimum context assembled for the subagent before dispatch. Keeping context
minimal and explicit reduces the risk of the subagent using stale, irrelevant, or contradictory
information.

RULE: List only what is actually included. Do not describe context that was considered but
excluded — use the "Explicitly Excluded Context" section for that.

---

## Subagent ID

{{SUBAGENT_ID}}

## Parent Session

{{SESSION_ID}}

## Created At

{{YYYY-MM-DDTHH:MM:SSZ}}

---

## Source Files Included

<!-- List every source file or directory passed to the subagent. Use workspace-relative paths. -->

| Path | Reason Included |
|------|----------------|
| {{FILE_PATH}} | {{why this file is needed}} |

---

## Witness Artifacts Included

<!-- List any `.witness/` artifacts included (e.g. current-state.md, a specific handover,
     a risk assessment file). -->

| Artifact | Reason Included |
|----------|----------------|
| {{ARTIFACT_PATH}} | {{why it is needed}} |

---

## ADRs Referenced

<!-- List any ADRs explicitly included in context. -->

- {{ADR_REFERENCE}}

---

## Current State Reference

<!-- State whether `.witness/current-state.md` was included in context, and if so, which
     sections are relevant. -->

{{CURRENT_STATE_REFERENCE}}

---

## Explicitly Excluded Context

<!-- List context that was considered but deliberately excluded, and why. This prevents the
     subagent from making assumptions about what was available. -->

- {{EXCLUDED_ITEM}}: {{reason for exclusion}}

---

## Estimated Token Count

<!-- Approximate token count of all included context, if measurable. Used to manage
     context window pressure. -->

{{ESTIMATED_TOKEN_COUNT}}

---

## Notes

<!-- Any additional notes about context selection, quality concerns, or preparation decisions. -->

{{NOTES}}
