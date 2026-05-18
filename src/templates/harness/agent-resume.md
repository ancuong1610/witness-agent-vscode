# Witness Harness — Agent Resume Protocol

Use this protocol when joining or resuming a project as the primary coding agent.

---

## Step 1 — Load the Read Set

Load the default read set first, in order:

1. `.witness/index.md`
2. `.witness/current-state.md`
3. `.witness/handovers/latest.md`

If the developer has provided a reviewed context packet
(`.witness/sessions/<session-id>-context-packet-NNN.md`), use it as the primary resume artifact.
The context packet supersedes the individual files where it covers the same content. Do not use
an unreviewed packet. A packet is unreviewed if it contains unresolved mandatory markers
(`[MANDATORY]`, `<!-- MANDATORY -->`).

Do not load telemetry, all session files, all ADRs, or all subagent ledger entries by default.

---

## Step 2 — Answer the Resume Questions

Before making any edits, answer these five questions from the loaded artifacts:

1. **What is the current goal?**
   State the session goal or the top-level project goal if no session is active.

2. **What was last completed?**
   Identify the last completed task or milestone from the handover or context packet.

3. **What is still unresolved?**
   List any open issues, pending subagent reviews, outstanding decisions, or gap markers from
   the handover.

4. **What should not be touched?**
   Identify any files, directories, or behaviors marked as out-of-scope, locked, or pending
   review. Do not edit these until the developer confirms.

5. **What is the next safe step?**
   State one specific, concrete action to take first. If the handover or context packet names
   an explicit next step, use it. Do not improvise a next step if one is provided.

If the handover and `current-state.md` conflict on any point, ask the developer to clarify
before proceeding. Do not resolve the conflict by choosing the more recent file unilaterally.

---

## Step 3 — Check Continuity Status

Before editing, check whether any continuity issues are present:

- If the developer reports a non-clear Witness status (`Review Needed`, `Risk Critical`,
  `Subagent Blocked`, `Stale Artifacts`), follow `.witness/harness/continuity-issue.md`.
- If a subagent ledger entry is in a `blocked` or `needs-review` state, do not proceed past
  it without developer confirmation.
- If a handover contains validation errors (`[ERROR]` markers), report them before proceeding.

---

## Step 4 — Proceed

Once the resume questions are answered and no blocking continuity issues exist, proceed with
the next safe step identified in Step 2.

Checkpoint regularly. At natural stopping points within the session, note what was completed,
what changed, and what is still open. This supports the next handover.

---

## Session End

When the session is ending or the developer requests a handover:

- Do not generate or modify the handover yourself. The developer runs
  `Witness: Generate Handover` and `Witness: Validate Handover`.
- You may assist by summarizing what was completed and what was left open.
- Follow `.witness/harness/session-switch.md` if the developer is preparing a session switch.

---

## Constraints

- Do not rewrite `.witness/current-state.md` without developer review.
- Do not accept subagent work without developer review.
- Do not scan telemetry unless explicitly asked.
- Do not infer undocumented decisions. Ask if a decision is not in an ADR.
