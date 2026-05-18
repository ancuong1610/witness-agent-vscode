# Context Packet: {{PACKET_ID}}

This packet assembles the minimum reliable context a fresh primary coding-agent session needs
to resume work without scanning all `.witness/` files. Review every section before handing this
to an agent. Do not use an unreviewed packet.

---

## Metadata

| Field | Value |
|-------|-------|
| Packet ID | {{PACKET_ID}} |
| Session ID | {{SESSION_ID}} |
| Packet Ordinal | {{PACKET_ORDINAL}} |
| Created At | {{CREATED_AT}} |
| Source Current State | `.witness/current-state.md` |
| Source Handover | `.witness/handovers/latest.md` |
| Developer Review Required | YES |

---

## Purpose

This packet is for starting or resuming a primary coding-agent session. It contains the
minimum reviewed context needed for the agent to begin productive work. It does not replace
the full `.witness/` archive — it replaces the need to scan it at session start.

Use this packet as the initial context message for a fresh agent session. Pull optional
references only when the task explicitly requires them.

---

## Required Read Set

The agent must read these files before taking any action. They are the authoritative sources
for project state, constraints, and handover instructions.

- `.witness/index.md`
- `.witness/current-state.md`
- `.witness/handovers/latest.md`

---

## Validation Checklist

Complete every item before using this packet with an agent session.

- [ ] Developer reviewed this packet before use
- [ ] Current state is up to date and reflects the actual project state
- [ ] Handover has no mandatory placeholders (`{{`, `MANDATORY`, `[MISSING`, `<fill`)
- [ ] Linked ADRs are accessible at their referenced paths
- [ ] Packet excludes raw telemetry and raw session history
- [ ] Optional references have been verified or removed if stale

---

## Current State

> Source: `.witness/current-state.md`

{{CURRENT_STATE_CONTENT}}

---

## Latest Handover

> Source: `.witness/handovers/latest.md`

{{HANDOVER_CONTENT}}

---

## Optional References

These are references only — not inlined content. Pull a file into context only when the task
requires it.

### Risk Assessment

{{RISK_REFERENCE}}

### Workspace Observation

{{OBSERVATION_REFERENCE}}

### ADRs Referenced in Handover

{{ADR_REFERENCES}}

### Subagent Ledgers and Reports

{{SUBAGENT_REFERENCES}}

---

## Excluded Context

The following items are intentionally excluded from this packet. Do not include them in the
agent's initial context.

- `.witness/telemetry/` — raw OTel event logs
- `.witness/telemetry/otel/events.jsonl` — raw event stream
- Full session archive (`.witness/sessions/`)
- Full subagent evidence files (`.witness/subagents/**/evidence.md`)
- All templates (`.witness/templates/`)
- Full evaluation reports (`.witness/evaluation/`)

---

## Notes for the Next Agent

- Use this packet as starting context. Do not scan all `.witness/` files at session start.
- Pull optional references only when the task explicitly requires them.
- Preserve continuity by updating `.witness/current-state.md` as work progresses.
- Generate a handover with `Witness: Generate Handover` before ending a session or switching context.
- Record architectural decisions with `Witness: Create ADR` immediately when made.
- If delegating to a subagent, use `Witness: Start Subagent Task` to open a contract before dispatch.
