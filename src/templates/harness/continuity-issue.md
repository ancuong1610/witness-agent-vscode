# Witness Harness — Continuity Issue Protocol

Use this protocol when the developer reports or you observe a non-clear Witness continuity
status. Non-clear statuses include: `Review Needed`, `Risk Critical`, `Subagent Blocked`,
and `Stale Artifacts`.

---

## Step 1 — Read the Resolver Output

If the developer has run `Witness: Resolve Continuity Issue`, read the markdown preview it
produced. The preview answers four questions about the current top issue.

If no resolver output is available, use `.witness/` artifacts directly:

- For `Review Needed`: inspect the pending subagent ledger entry under `.witness/subagents/`.
- For `Risk Critical`: inspect the latest risk assessment in `.witness/sessions/`.
- For `Subagent Blocked`: inspect the blocked subagent's `evidence.md` and `report.md`.
- For `Stale Artifacts`: note the age of `.witness/handovers/latest.md` and
  `.witness/current-state.md`.

---

## Step 2 — Answer the Four Questions

From the resolver output or direct artifact inspection, answer:

1. **What happened?**
   State the specific issue in plain terms. Name the artifact, subagent, or dimension involved.

2. **Why does it matter?**
   Explain the risk to session continuity, work quality, or safe handover if the issue is
   not resolved.

3. **What should be done next?**
   Name the specific Witness command or action that addresses this issue. Do not prescribe a
   generic response. Name the command: `Witness: Review Subagent Task`,
   `Witness: Generate Handover`, `Witness: Resolve Continuity Issue`, etc.

4. **What evidence was used?**
   List the artifact paths you inspected to reach this conclusion.

---

## Step 3 — Decide Whether to Proceed

After answering the four questions, assess whether it is safe to continue implementation:

**Do not continue if:**
- A subagent is in `blocked` or `failed` state and its work is a dependency for the current task.
- The risk level is `RED` or `BLOCKED` (critical).
- The handover contains unresolved validation errors.
- A context packet has unresolved mandatory markers.

**You may continue with caution if:**
- The issue is a pending subagent review that does not block the current task.
- The stale artifact is not a dependency for the current editing scope.
- The developer has explicitly acknowledged the issue and directed you to proceed.

---

## Step 4 — Recommend the Relevant Action

Recommend the appropriate Witness command. Do not pretend to execute it. The developer
must run the command.

| Issue | Recommended Command |
|-------|---------------------|
| Subagent blocked or failed | `Witness: Resolve Continuity Issue` then `Witness: Show Workspace Status` |
| Subagent pending review | `Witness: Review Subagent Task` |
| Risk level RED / BLOCKED | `Witness: Generate Handover` then `Witness: Validate Handover` |
| Stale handover | `Witness: Checkpoint Now` or `Witness: Generate Handover` |
| Missing artifacts | `Witness: Resolve Continuity Issue` |

---

## Step 5 — If Artifact Evidence Is Missing

If you cannot answer the four questions because the relevant artifacts are absent or unreadable:

- Do not guess or infer.
- Ask the developer to run `Witness: Resolve Continuity Issue` or
  `Witness: Show Workspace Status`.
- State what artifact is missing and why it is needed to proceed safely.

---

## Constraints

- Do not mark a continuity issue as resolved yourself. Resolution requires the developer to
  run the appropriate command and confirm the output.
- Do not continue past a blocked subagent or RED/BLOCKED risk without developer confirmation.
- Do not rewrite or modify any `.witness/` artifact to fix a continuity issue directly.
