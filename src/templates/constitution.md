# Witness Constitution

This document governs how Witness Agent records, compresses, and loads context across Copilot
sessions in this workspace. Every record in `.witness/` should conform to the principles here.
When in doubt about what to record, how to summarize, or when to escalate risk, consult this file.

---

## Purpose

Copilot sessions are ephemeral. Each new session begins without memory of prior decisions,
mid-edit files, open constraints, or rationale. Witness Agent exists to bridge that gap by
maintaining a structured, human-reviewed artifact system that a fresh session can read and act on
safely.

The goal is not exhaustive logging. The goal is that a competent developer — or a fresh AI
session — can read the handover package and resume work without re-discovering context that
already exists.

---

## Non-Goals

- This system does not generate code.
- This system does not replace Copilot or any AI coding assistant.
- This system does not run automatically in the background without human review.
- This system does not store raw chat logs or full conversation transcripts.
- This system does not push, commit, or deploy anything on your behalf.

---

## Core Rule

> Store broadly. Compress carefully. Load minimally. Validate resume quality.

What this means in practice:

- **Store broadly**: When recording a session, capture more than you think you need. Edge cases,
  rejected approaches, and mid-edit states are all valuable.
- **Compress carefully**: Handover documents are summaries, not dumps. Each entry should earn its
  place by being something a fresh session cannot safely infer from the code alone.
- **Load minimally**: A fresh Copilot session should read only what it needs to resume the next
  safe step. Do not front-load everything — use the Default Read Set.
- **Validate resume quality**: Before declaring a handover ready, run a resume probe. If a fresh
  session cannot answer the probe questions correctly, the handover is not good enough.

---

## Five Continuity-Risk Dimensions

Continuity risk is evaluated across five independent dimensions. Each dimension can independently
raise or lower the overall risk level.

1. **Active Context Pressure** — How full is the current Copilot session's context window? High
   pressure means the model has less room to reason and is more likely to drop earlier context.

2. **Artifact Externalization Gap** — How much of what happened in the session has been persisted
   to `.witness/`? Changed files not documented, decisions not recorded, missing validation
   results, a stale `current-state.md`, or a stale `handovers/latest.md` all widen this gap and
   raise resume risk.

3. **Subagent Boundary Risk** — How well has subagent work been recorded and integrated? If a
   subagent was used but no report exists, if its decisions were not folded back into the parent
   session, if its changed files were not listed, or if the parent accepted vague subagent output,
   the boundary is at risk. Rule: if subagent work affects the result, it must be recorded.

4. **Quality Drift** — Are there signals that the AI session is losing reliability? Repeated user
   corrections, wrong file assumptions, "you forgot", "we already decided", contradictions with
   the plan, and hallucinated completed actions all indicate drift.

5. **Phase Boundary Risk** — Is the workflow at a natural checkpoint? Boundaries between
   `specify → plan`, `plan → tasks`, `tasks → implementation`, `implementation → validation`,
   `validation → release`, and between completed vertical slices are the highest-risk transitions
   for context loss.

---

## Risk Level Vocabulary

Use exactly these five levels when recording or communicating risk. Do not invent variants.

| Level     | Meaning |
|-----------|---------|
| GREEN     | Low risk. Context is fresh, pressure is low, validation is recent, handover is complete. Safe to continue. |
| YELLOW    | Moderate risk. One dimension is elevated but manageable. Note the factor; continue with awareness. |
| ORANGE    | Elevated risk. Two or more dimensions are stressed, or one is severely elevated. Consider a checkpoint. |
| RED       | High risk. Resuming from here without a validated handover is likely to produce errors or lost work. Generate a handover now. |
| BLOCKED   | Do not continue. A critical condition (e.g., mid-edit conflict, failed probe, severe rot) prevents safe resumption. Resolve the blocker before continuing. |

### Important Rule

High risk does not mean "switch sessions immediately." It means "generate a handover before the
next session boundary." You can continue working within a session even at ORANGE or RED — but you
must not end the session without producing and validating a handover if risk is elevated.

---

## Default Read Set

When starting a fresh Copilot session, the model should read the following files in order before
doing any work. This is the minimum context load for safe resumption.

1. `.witness/constitution.md` — the rules and vocabulary (this file)
2. `.witness/current-state.md` — where the project is right now
3. The most recent `.witness/handovers/<handover-id>.md`
4. Any ADRs linked from the handover that are relevant to the next step
5. `.witness/commands.md` — what commands are available (optional, for orientation)

Do not load entire session histories, all subagent reports, or the full ADR archive at session
start. Load only what is needed to take the next safe step.
