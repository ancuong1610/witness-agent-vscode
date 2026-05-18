# Witness Orchestrator Harness

---

## 1. Purpose

This file guides orchestrator-style coding agents that delegate bounded tasks to subagents within
a Witness-managed project.

It applies to any coding-agent workflow that can read project files and follow markdown
instructions, including:

- Codex-style workflows
- Superpowers-style workflows
- Claude Code-style workflows
- Copilot-style workflows
- Any future coding-agent orchestration pattern

It does not require direct API integration with Witness. It does not imply any specific tool.
The patterns described here are workflow conventions, not automation hooks.

**This file is only used when the developer or coding agent explicitly references it. Witness does
not automatically inject it into any coding-agent context.**

Coding agents can use this file when the developer loads or references it.

---

## 2. Core Rule

**Use the smallest Witness ledger level that preserves accountability.**

**Do not use a full Subagent Ledger for every tiny task.**

**Do not wait until failure to create traceability for risky work.**

The Witness Subagent Ledger is a precision instrument. Overusing it on trivial tasks wastes time
and creates noise. Underusing it on risky or multi-file tasks makes failures untraceable and
handovers unreliable. The calibration between the three levels below is the core judgment the
orchestrator must make before delegating any task.

---

## 3. Progressive Subagent Ledger

### Level 0 — No Ledger

Use when the task is small, reversible, and carries no handover relevance.

**Use for:**
- Typo fix
- Label rename
- Simple formatting change
- Small comment update
- Single-file edit with no architectural impact
- Reversible change with no test or build risk

**Do not use Level 0 if:**
- The task touches more than one file in a non-trivial way
- The task involves any logic change
- The task has unclear acceptance criteria
- The work needs to be reviewable before integration

**Expected output:** A short inline summary of what was done — no Witness artifact required.

---

### Level 1 — Lightweight Ledger

Use for normal delegated tasks that have evidence value but are not high-risk.

**Use for:**
- Delegated investigation or research task
- Small implementation task touching one or two files
- Task that should be traceable but does not require full review
- Task where a short report is useful for the next session

**Expected structure:**
Provide the subagent with:
- Task goal (one or two sentences)
- Scope (files the subagent may inspect and modify)
- Constraints (what must not be changed)
- Expected evidence (what the subagent must record)
- Completion summary format (what a done report looks like)

**If using Witness commands, use a reduced ledger path:**
- `Witness: Start Subagent Task` to record the contract
- `Witness: Record Subagent Evidence` after the subagent finishes
- `Witness: Complete Subagent Task` if a formal completion report is needed
- Review (`Witness: Review Subagent Task`) is optional unless the output affects integration
  decisions

Do not require a full context packet unless the subagent needs cross-session state or the task
has handover relevance.

---

### Level 2 — Full Ledger

Use for multi-file, high-risk, or handover-relevant delegated tasks.

**Use for:**
- Multi-file change
- Architecture or workflow change
- Extension source behavior change
- Test, build, or deployment impact
- Failed or blocked prior attempt
- Unclear acceptance criteria requiring developer review before integration
- Subagent output that must be reviewed and accepted before being promoted to `current-state.md`
- Any task whose failure would leave the session in an unknown state

**Expected Witness lifecycle:**

1. `Witness: Start Subagent Task` — record the contract with full acceptance criteria
2. `Witness: Create Subagent Context Packet` — assemble minimum context; developer reviews before
   dispatch
3. Subagent works from the contract and context packet only
4. `Witness: Record Subagent Evidence` — files inspected, modified, actions taken, verification
   output, assumptions, open questions
5. `Witness: Complete Subagent Task` — acceptance criteria status, gaps, completion status
6. `Witness: Review Subagent Task` — orchestrator or developer records integration decision

Do not integrate Level 2 subagent output into the main session without a completed review.

---

## 4. Before Delegation Checklist

Before launching a subagent, the orchestrator must be able to answer all of the following:

- What is the task goal? (one or two sentences, not a paragraph)
- What ledger level is appropriate? (Level 0 / Level 1 / Level 2)
- Which files may the subagent inspect?
- Which files may the subagent modify?
- What evidence is required from the subagent?
- What is the stop condition? (when is the task done, and when does the subagent stop rather
  than continue?)
- Could this task conflict with another running subagent's file ownership?
- Does this task require developer approval before the output is integrated?

If any of these cannot be answered, do not delegate yet. Resolve the ambiguity first.

---

## 5. Multiple Subagent Policy

When running multiple subagents in parallel or in sequence:

- Assign exactly one bounded task per subagent. Do not let two subagents own the same task.
- Avoid overlapping file ownership. If two tasks need the same file, define which subagent may
  modify it and which may only inspect it.
- Give each subagent only its relevant contract and context packet. Do not share the full
  `.witness/` directory with any subagent.
- Define clear stop conditions for each subagent before dispatch.
- If two subagents need the same file for modification, the orchestrator or developer must
  explicitly assign ownership and sequence the tasks.
- If one subagent is blocked or failed, do not retry blindly and do not allow a second subagent
  to inherit the same scope without a recorded review of the failure.
- Record evidence and a completion report for every subagent that attempted non-trivial work,
  even if the attempt failed.

---

## 6. Failure Policy

When a subagent fails or reports a blocker, the response is always the same: stop, record,
and escalate. Never retry blindly.

**Immediate actions:**

1. Stop the subagent from continuing.
2. Ask the subagent to produce or provide:
   - What it was attempting to do
   - Which files it inspected
   - Which files it modified (and what changed)
   - Any command or test output
   - Assumptions it made during execution
   - The specific blocker or failure reason
   - Its recommended next step
3. Record the evidence and completion report through Witness when appropriate
   (`Witness: Record Subagent Evidence`, `Witness: Complete Subagent Task` with status `blocked`
   or `failed`).
4. Use `Witness: Resolve Continuity Issue` to navigate the issue in the context of the full
   project state.
5. Create a smaller, narrower follow-up task if the original task was too broad.

Do not hide failed attempts. A recorded failed attempt is more valuable than silence: it
documents what was tried, what failed, and what the next step should be. The Witness Subagent
Ledger is the traceability record for this.

---

## 7. Context Minimization

The orchestrator must not send the full `.witness/` folder to any subagent by default.

**Default context for a subagent:**
- `.witness/AGENTS.md` — entry point constraints and read set
- The assigned `contract.md` — task scope, criteria, allowed files
- The `context-packet.md` for the task, if one was assembled
- Only the source files listed in the contract as inspectable or modifiable
- Prior evidence only when the task explicitly depends on it

**Do not include by default:**
- Raw telemetry (`.witness/telemetry/`)
- All ADRs (`.witness/decisions/`) — include only those referenced in the contract
- All handovers (`.witness/handovers/`) — include only `latest.md` if needed for context
- All subagent ledger entries — include only those referenced in the contract

Excess context makes it harder for the subagent to stay in scope and increases the risk of
the subagent making changes outside the intended files.

---

## 8. What the Orchestrator Must Not Do

The following behaviors are not permitted regardless of tool, workflow, or framing.

- Do not self-review subagent work. Review decisions require the developer or a designated
  primary agent who is not the work's author.
- Do not mark a review as accepted or rejected without an explicit developer decision.
- Do not retry a failed subagent indefinitely without recording the failure and narrowing scope.
- Do not hide failed attempts. If a subagent attempted work and produced a partial result, that
  must be recorded.
- Do not continue after a RED or BLOCKED risk level without first generating and validating a
  handover.
- Do not rewrite `.witness/current-state.md` without developer review and explicit approval.
- Do not inject context into another tool automatically.
- Do not claim that Witness approved or endorsed an action when Witness only suggested or
  surfaced it as an option.

---

## 9. Example Prompts

These prompts can be copied as-is or adapted. They are not templates the orchestrator fills in
automatically. The developer or orchestrator provides them when directing a coding agent.

### A. Start of orchestrated session

```text
Follow `.witness/AGENTS.md` and `.witness/harness/orchestrator.md`.
Before delegating work, classify each task into:
- Level 0: No Ledger
- Level 1: Lightweight Ledger
- Level 2: Full Ledger
Use the smallest ledger level that preserves accountability.
Do not use full ledger for tiny tasks.
Do not wait until failure to create traceability for risky work.
```

### B. Launching a subagent task

```text
You are being delegated a scoped task under the Witness workflow.
Read the assigned task contract and only the context explicitly provided.
Do not scan the whole `.witness/` folder.
Stay inside the allowed files and scope.
Record evidence: files inspected, files modified, actions taken, verification output,
assumptions, and open questions.
If blocked, stop and report the blocker clearly.
Do not mark your own work reviewed.
```

### C. Handling a blocked or failed subagent

```text
A subagent appears blocked or failed.
Do not retry blindly.
Inspect the available contract, evidence, report, and relevant source files.
Summarize:
1. What failed?
2. What evidence exists?
3. Which files were touched?
4. What assumptions were made?
5. What is the smallest safe follow-up task?
Then recommend whether to review, close, retry with narrower scope, or ask the developer.
```

### D. Preparing session switch after orchestrated work

```text
Before ending this orchestrated session, verify:
- all subagent tasks have evidence or reports
- blocked tasks are recorded
- tasks requiring review have review decisions
- current-state is up to date
- handover is generated and validated
- context packet is created for resume
Do not load all `.witness/` files into the next session by default.
Use the default read set and pull optional artifacts only when needed.
```
