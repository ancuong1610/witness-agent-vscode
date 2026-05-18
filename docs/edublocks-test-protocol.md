# EduBlocks Test Protocol

This document defines the five acceptance tests for the Witness Agent v0.1 implementation. Each
test validates one capability area. Tests must be run against a real VS Code Extension Development
Host, not mocked or unit-tested in isolation.

The EduBlocks workspace is used as the target project for testing because it is a known,
realistic codebase — not a toy project. Tests should not modify EduBlocks source code; they
only observe the `.witness/` directory created within it.

---

## Test 1: Initialize Witness

**Status**: Ready — implemented in v0.1 full.

**Objective**: Verify that `Witness: Initialize Project` creates the correct directory structure,
populates the correct files, and refuses to overwrite an existing `.witness/`.

**Setup**:
1. Open the EduBlocks workspace folder in the Extension Development Host.
2. Confirm that `.witness/` does not exist.

**Steps**:
1. Open the Command Palette and run `Witness: Initialize Project`.
2. Observe the information message: "Witness: Initialized .witness/ in your workspace."
3. Inspect the `.witness/` directory tree.
4. Run `Witness: Initialize Project` a second time.
5. Observe the information message: "Witness already initialized in this workspace."
6. Confirm that `.witness/` has not changed.

**Success Criteria**:
- `.witness/` is created at the workspace root.
- All seven subdirectories exist: `templates/`, `sessions/`, `telemetry/`, `subagents/`,
  `decisions/`, `handovers/`, `evaluation/`.
- All four top-level documents exist: `constitution.md`, `index.md`, `current-state.md`,
  `commands.md`.
- All six template files exist in `.witness/templates/`.
- All six record directories contain a `.gitkeep` file and nothing else.
- Running the command a second time produces the "already initialized" message and makes no
  changes to `.witness/`.
- No EduBlocks source files are modified.

---

## Test 2: Observe Green-Phase Project State

**Status**: Ready — implemented in v0.1 full. `current-state.md` is filled in manually by the
developer (this is intentional — the extension provides the template; the developer provides the
actual project state).

**Objective**: Create `current-state.md` and the first session record from the completed
EduBlocks state, so a fresh Copilot session can later resume from a known baseline.

**Setup**: `.witness/` must already be initialized (run Test 1 first). EduBlocks should be in
its known "green" state — tests pass, no in-flight edits.

**Steps**:
1. Open `.witness/current-state.md` directly and fill in: Project, Current Phase, Last Updated,
   Recently Completed, In Progress (should be "None — green phase"), Next Safe Step,
   What Not To Do. Use the placeholders as the field list.
2. Run `Witness: Start Session`. Enter a goal that reflects observation only, e.g.
   "Baseline observation of EduBlocks green state."
3. Inspect `.witness/sessions/` — a new file should exist named `YYYY-MM-DD-001.md` for today.
4. Open the file. Verify: session ID, started-at timestamp (ISO 8601), and goal are populated;
   placeholders for fields the user will fill in (Files Touched, Outcome, etc.) remain.
5. Inspect `.witness/.current-session` — it should contain exactly the session ID from step 3.
6. Inspect `.witness/telemetry/<session-id>/` — the directory should exist with a `.gitkeep`.

**Success Criteria**:
- `current-state.md` no longer contains `{{...}}` placeholders for the required fields.
- A session file exists at `sessions/YYYY-MM-DD-001.md` following `session-template.md`.
- Started-at timestamp is a valid ISO 8601 UTC string.
- `.current-session` points to the new session ID.
- The corresponding telemetry directory exists.
- No EduBlocks source files are modified.

---

## Test 3: Record Context Pressure

**Status**: Ready — `Witness: Record Context Snapshot` is implemented in Task 002.

**Objective**: Record `context-pressure-001.md` from available VS Code / Copilot context
information, or from a user-provided estimate, so the snapshot file is well-formed and the
pressure level is computed correctly from the locked thresholds.

**Setup**: A session must be active (run Test 2 first).

**Steps**:
1. Run `Witness: Record Context Snapshot`.
2. In the QuickPick, select a measurement method (`direct`, `CLI-context-output`, or
   `proxy-estimate`).
3. In the InputBox, enter an estimated pressure percentage (e.g. `45`). The InputBox should
   reject non-integers, negatives, and values above 100 via live validation.
4. After submission, observe the information message: "Witness: Snapshot 001 recorded —
   MEDIUM (45%)." (The level depends on the percentage entered.)
5. The snapshot file should open automatically in the editor.
6. Inspect `.witness/telemetry/<session-id>/context-pressure-001.md`. Verify:
   - Session ID matches the active session.
   - Snapshot Taken At is a valid ISO 8601 UTC string.
   - Method matches the user's selection.
   - Estimated context usage matches the entered percentage with a `%` suffix.
   - Pressure Level matches the locked thresholds (0-30 LOW, 31-55 MEDIUM, 56-75 HIGH,
     76-90 VERY HIGH, 91-100 CRITICAL).
   - Contributing Factors and Notes sections still contain placeholders for the user to fill in.
7. Run `Witness: Record Context Snapshot` a second time. The new file should be named
   `context-pressure-002.md` and not overwrite the first.

**Success Criteria**:
- Each invocation produces a new, sequentially-numbered snapshot file.
- The computed level matches the locked thresholds exactly for every test percentage.
- Invalid input is rejected before file creation (no malformed snapshots written).

---

## Test 4: Generate Handover

**Status**: Ready — implemented in v0.1 full.

**Objective**: Generate `handovers/latest.md` (and a dated copy) so a fresh Copilot session can
resume from a single, compressed entry point.

**Setup**: Tests 1-3 should have run successfully. The active session should have at least one
context-pressure snapshot, and `current-state.md` should be filled in.

**Steps**:
1. Run `Witness: Generate Handover`. Inspect the new file in `handovers/`.
2. Open `handovers/latest.md`. Verify it is either the same file or a pointer to it.
3. Verify the handover references the current session, the latest context-pressure snapshot,
   and `current-state.md`.
4. Verify the Risk Assessment table uses all five locked dimensions (Active Context Pressure,
   Artifact Externalization Gap, Subagent Boundary Risk, Quality Drift, Phase Boundary Risk).
5. Verify the Recommended Risk Level is one of GREEN / YELLOW / ORANGE / RED / BLOCKED.

**Success Criteria**:
- A handover file exists in `handovers/`.
- `handovers/latest.md` reflects the most recently generated handover.
- All five locked risk dimensions appear in the handover (not the Task 001 misnamed set).
- Links to session, snapshots, and `current-state.md` resolve.

---

## Test 5: Fresh Copilot Resume

**Status**: Ready — implemented in v0.1 full. Requires a fresh Copilot session for the live
evaluation step, but the probe creation command is complete.

**Objective**: Start a fresh Copilot session with only `index.md`, `current-state.md`, and
`handovers/latest.md` loaded, then run a resume probe to verify the fresh session understands
project state, constraints, next safe step, and what not to do.

**Setup**: Tests 1-4 should have run successfully. A validated handover should exist.

**Steps**:
1. Run `Witness: Create Resume Probe`. Open the new probe document in `evaluation/`.
2. Open a completely fresh GitHub Copilot chat session (close any prior session first).
3. Instruct the fresh session to load ONLY the Default Read Set:
   - `.witness/index.md`
   - `.witness/current-state.md`
   - `.witness/handovers/latest.md`
4. Ask the fresh session each question listed in the resume probe document.
5. Grade each answer against the Expected Answers in the probe document. Record results.
6. Run `Witness: Validate Handover` to mark the handover as validated if the probe passes.

**Success Criteria** (from locked Section 15):
- The fresh session understands project state, constraints, next safe step, and what not to do.
- All three mandatory questions (next safe step, files in flight, prohibitions) are answered
  correctly.
- At least 5 of 7 probe questions pass.
- No EduBlocks source files were modified during the test run.
