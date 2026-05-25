# Witness Agent v7 Validation Report

**Date:** 2026-05-25
**Version:** v7
**Theme:** First-Use UX Compression
**Core principle:** First value before first explanation.

---

## 1. Overview

v7 is First-Use UX Compression.

It reduces the first-use path from multiple conceptual steps to:

```text
Start with Witness
-> answer one question
-> paste prompt
-> code normally
```

New users should not need to understand Witness concepts before getting Witness value. The primary
workflow is now one beginner command, one task question, and one copy-ready prompt.

---

## 2. Original Usability Problem

Reviewer feedback identified the following first-use problems:

- The first-use learning curve was too high.
- It was unclear how to initialize/start correctly.
- It was unclear when to start tracking or checkpoint.
- A visual walkthrough graph was requested.
- A user manually deleted session files because they did not know how to restart cleanly.
- Too many commands and too much system complexity were visible too early.

The problem was not missing expert capability. The problem was that expert concepts appeared before
the first useful action.

---

## 3. Final v7 Capability Summary

v7 adds or updates:

- `Witness: Start with Witness`
- Native VS Code walkthrough
- Visual flow in onboarding
- `Witness: Start New Task`
- Status bar wording cleanup
- README/onboarding naming cleanup

These changes compress the first-use path while keeping advanced Witness commands available.

---

## 4. Final Counts

| Metric | Value |
|---|---:|
| `package.json` contributes.commands | 31 |
| `package.json` activationEvents | 32 |
| `src/extension.ts` registerCommand calls | 31 |
| Runtime dependencies | 0 |
| Internal-only commands | 1 (`witness.openStatusActions`) |

`witness.openStatusActions` remains internal only. It is registered by the status bar module and
is not listed in `package.json` contributes.commands or activationEvents.

---

## 5. v7.1 Start with Witness Validation

`Witness: Start with Witness` validation:

- Initializes Witness if `.witness/index.md` is missing.
- Asks "What are you working on?"
- Reuses the vague-goal warning from `Witness: Start Tracking This Task`.
- Creates a Witness tracking session.
- Opens a copy-ready coding-agent prompt.
- Does not call an LLM.
- Does not inject prompts automatically.
- Does not modify application source code.

The command uses existing initialization, task-goal, session creation, and prompt presentation
paths rather than creating a separate task-start architecture.

---

## 6. v7.2 Walkthrough Validation

`package.json` includes `contributes.walkthroughs`.

Walkthrough title:

```text
Witness: AI Coding Continuity
```

The walkthrough includes six steps:

1. Start with Witness
2. Paste Prompt into Coding Agent
3. Code Normally
4. Use the Witness Status Bar
5. Create Checkpoint
6. Resume with Witness

The onboarding page includes a compact visual flow showing:

```text
Open project
-> Start with Witness
-> Answer: "What are you working on?"
-> Paste prompt into coding agent
-> Code normally
-> Witness warns only when action is needed
-> Click status bar for recommended action
-> Create Checkpoint before stopping
-> Resume with Witness next time
```

---

## 7. v7.3 Start New Task Validation

`Witness: Start New Task` validation:

- Requires Witness to already be enabled.
- Detects the active session when present.
- Offers `Start New Task`, `Open Current Session`, and `Cancel`.
- Preserves old session files.
- Makes checkpoint creation optional and user-confirmed.
- Creates a new tracking session when the user proceeds.
- Opens the copy-ready coding-agent prompt.
- Prevents manual deletion of `.witness/sessions/` by providing a safe restart path.

The current architecture does not use a formal closed-session marker. The new session becomes the
active session through the existing `.witness/.current-session` pointer, while old session
artifacts remain untouched.

---

## 8. v7.4 Status Bar Wording Validation

Status bar QuickPick sections are now:

- Recommended
- Main Actions
- More Actions

Validation:

- Behavior unchanged.
- Command order unchanged.
- Tooltip unchanged.
- Recommended action logic unchanged.
- Softer wording used for new users.

Advanced commands were not removed. They are grouped under `More Actions`.

---

## 9. v7.5 README/Onboarding Validation

README/onboarding validation:

- README promotes `Witness: Start with Witness` as primary.
- `Witness: Enable for This Project` and `Witness: Start Tracking This Task` moved to
  manual/secondary beginner commands.
- `Witness: Start New Task` documented as the safe task-switching path.
- Native walkthrough mentioned.
- Safety boundaries preserved:
  - Witness is not your coding agent.
  - Witness does not automatically inject prompts.
  - Witness does not call an LLM directly.
  - Witness detects observable continuity degradation from `.witness/` artifacts. It does not
    directly detect hidden model context rot or true token pressure.
  - LLM may draft artifact updates. Witness validates artifact boundaries and structure.
    Developer approves.

---

## 10. Fresh-User Regression Checklist

- [ ] Fresh workspace without `.witness`
- [ ] Run `Witness: Start with Witness`
- [ ] Answer task goal
- [ ] Prompt opens
- [ ] Copy Prompt works
- [ ] Status bar visible
- [ ] Walkthrough visible
- [ ] Create checkpoint
- [ ] Resume with Witness
- [ ] Start new task without deleting files
- [ ] No need to understand handover/context packet/subagent ledger before first value

Manual Extension Development Host testing should complete the UI-specific checks.

---

## 11. Non-Goals Preserved

v7 preserved the following non-goals:

- No LLM calls.
- No direct provider API.
- No automatic prompt injection.
- No automatic source-code modification.
- No hidden transcript capture.
- No hidden reasoning capture.
- No command removals.
- No advanced command deletion.

---

## 12. Known Limitations

- Walkthrough UI must be manually checked in the Extension Development Host.
- `Witness: Start with Witness` still uses manual prompt paste.
- The status bar is still the main control surface.
- Advanced command count remains high but is de-emphasized.
- No marketplace polish yet.
- No deep coding-agent API integration.

---

## 13. Final v7 Status

v7 is closed if compile and count checks pass.

Final validation:

- `npm run compile`: pass.
- `package.json` contributes.commands: 31.
- `package.json` activationEvents: 32.
- `src/extension.ts` registerCommand calls: 31.
- Runtime dependencies: 0.
- `witness.openStatusActions`: internal only, absent from `package.json`.

v7 is closed.

---

*End of v7 Validation Report.*
