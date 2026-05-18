# Context Pressure Snapshot

Copy this template to `telemetry/<session-id>/context-pressure.md` and fill it in at the time of
measurement. Take a snapshot whenever you suspect pressure is becoming significant, before
generating a handover, or at regular intervals during a long session.

IMPORTANT: Active Context Pressure is not a context-rot score. It is a pressure gauge. High
pressure means the model has less working room — it says nothing about whether the context the
model holds is accurate, fresh, or complete. Other dimensions (Artifact Externalization Gap,
Subagent Boundary Risk, Quality Drift, Phase Boundary Risk) cover those concerns separately.

---

## Session ID

{{SESSION_ID}}
<!-- The session this snapshot belongs to, e.g. 2026-05-12-001 -->

## Snapshot Taken At

{{YYYY-MM-DDTHH:MM:SSZ}}

---

## Measurement Source

<!-- How was this measurement obtained? Choose the most accurate method available. -->

**Method**: {{direct / CLI-context-output / proxy-estimate}}

- `direct` — measured from a context window indicator in the Copilot UI or IDE tooling
- `CLI-context-output` — inferred from Copilot CLI output that indicates context limits
- `proxy-estimate` — manual estimate based on session length, file count, and tool calls

**Tool or method used**: {{describe the specific tool, command, or estimation approach}}

---

## Estimated Pressure

**Estimated context usage**: {{NN}}%

---

## Pressure Level

<!-- Map percentage to level using these thresholds (from constitution Section 10.1): -->
<!-- 0-30%: LOW | 31-55%: MEDIUM | 56-75%: HIGH | 76-90%: VERY HIGH | 91-100%: CRITICAL -->

**Level**: {{LOW / MEDIUM / HIGH / VERY HIGH / CRITICAL}}

---

## Contributing Factors

<!-- Check all that apply and add notes. These factors help explain why pressure is at this level. -->

| Factor | Present? | Detail |
|--------|----------|--------|
| Long conversation (many turns) | {{yes/no}} | {{approx turn count}} |
| Many files opened / loaded into context | {{yes/no}} | {{approx file count}} |
| Heavy tool call usage | {{yes/no}} | {{types of tools used}} |
| Large artifacts loaded (e.g. full file contents) | {{yes/no}} | {{which artifacts}} |
| Long system prompt or instructions | {{yes/no}} | {{notes}} |
| Repeated context re-loads (rot correction attempts) | {{yes/no}} | {{notes}} |

---

## Notes

<!-- Any additional context about this snapshot: why pressure is high, what was loaded, whether
     this snapshot triggered a handover decision, etc. -->

{{NOTES}}
