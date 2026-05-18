# Witness Harness — Subagent Task Protocol

Use this protocol when you are acting as a subagent delegated a bounded task by a primary agent
or developer. A subagent operates within a specific ledger entry under `.witness/subagents/`.

---

## Step 1 — Read the Contract

Read `contract.md` before doing anything else. The contract defines:

- Task goal and acceptance criteria
- Scope boundaries (in-scope and out-of-scope)
- Source files and artifacts to inspect
- Any constraints or known risks

Stay within the scope defined by the contract. If you need to do something outside it, stop
and report the gap. Do not expand scope without explicit developer approval.

---

## Step 2 — Read the Context Packet

If `context-packet.md` is present in your ledger entry, read it before starting work. The
context packet contains the relevant artifacts and state selected by the developer or primary
agent for your task. Do not load additional `.witness/` files beyond what the packet references
unless the contract explicitly lists them.

---

## Step 3 — Execute the Task

Perform the work described in the contract. As you work, track:

- Files you inspect (path and what you looked for)
- Files you modify (path, what changed, and why)
- Actions you take (commands run, tests executed, builds triggered)
- Verification output (test results, lint output, build results)
- Assumptions you make when information is missing
- Open questions that arose during execution

If you encounter a decision point not covered by the contract, record it as an open question.
Do not resolve undocumented architectural decisions by assumption.

---

## Step 4 — Record Evidence

Produce or fill in `evidence.md` in your ledger entry. Evidence must include:

- Files inspected and what was found
- Files modified and what changed
- Actions taken and verification output
- Assumptions made
- Open questions

If you cannot fill evidence because work was blocked, record the blocker explicitly instead.
Do not omit evidence because the task was simple. Evidence is required regardless of scope.

---

## Step 5 — Produce a Completion Report

Produce or fill in your completion report. The report must include:

- Completion status: `complete`, `complete-with-warnings`, `blocked`, or `failed`
- Acceptance criteria status — pass, fail, or not-verifiable for each criterion in the contract
- Any gaps between what was accomplished and what the contract required
- Any follow-up actions the primary agent or developer should take

---

## If You Are Blocked

If you cannot complete the task, do not continue looping silently. Record:

- What you were attempting
- What obstacle was encountered
- What evidence supports the blocker (error message, file state, missing artifact)
- What information or action would unblock the task

Report blocked status explicitly. Do not mark the task complete with a note buried in the
evidence. The completion status must be `blocked` or `failed`.

---

## Constraints

- Do not self-review. Do not write or fill in `review.md`. Review is reserved for the developer
  or primary agent who delegated the task.
- Do not accept your own work. Do not set a `reviewDecision` to `accepted`.
- Do not write outside your ledger entry directory without explicit contract authorization.
- Do not load the full `.witness/` directory. Load only what the contract and context packet
  authorize.
- Do not rewrite `.witness/current-state.md`.
- Do not generate handovers.
