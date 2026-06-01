# Witness Agent v8 Validation Report

**Theme:** Workflow-First Command Surface
**Status:** CLOSED, pending final compile/count verification in this run
**Date:** 2026-06-01

---

## 1. Overview

v8 is Workflow-First Command Surface.

It adds simple user-facing workflow names, a one-page cheatsheet, a simplified status bar menu,
and command tiers. The goal is to let normal users act on clear moments instead of learning the
full Witness command surface first.

Core v8 principle:

> Users should learn 5 moments, not 40 commands.

---

## 2. Original Problem

Witness had many powerful commands. That power was useful for creator, research, advanced
handover, subagent, and diagnostic workflows, but normal users saw too many internal concepts too
early.

The command surface still felt like a toolbox or methodology. Users had to decide between terms
such as checkpoint, context packet, handover, ADR, subagent ledger, risk assessment, and evaluation
summary before they had a simple answer to:

> What should I do now?

v8 addresses that by making beginner surfaces workflow-first while preserving advanced commands.

---

## 3. Final v8 User Model

Users should learn these moments:

- Start
- Save
- Resume
- Switch
- Fix
- Status
- Cheatsheet

Maintenance moments:

- Update Memory
- Check Memory Update

These are represented by the v8 command names, README/onboarding language, cheatsheet, and status
bar menu.

---

## 4. Final Counts

Expected final counts after v8:

| Check | Expected |
|---|---:|
| `package.json` contributes.commands | 40 |
| `package.json` activationEvents | 41 |
| `src/extension.ts` `registerCommand` calls | 40 |
| runtime dependencies | 0 |

`witness.openStatusActions` remains internal only. It is registered by the status bar module and is
not contributed in `package.json`.

---

## 5. v8.1 Alias Validation

v8.1 added workflow-first aliases:

| Visible command | Alias ID | Delegates to |
|---|---|---|
| Witness: Start | `witness.start` | `witness.startWithWitness` |
| Witness: Status | `witness.status` | `witness.showWorkspaceStatus` |
| Witness: Save Progress | `witness.saveProgress` | `witness.createCheckpoint` |
| Witness: Resume | `witness.resume` | `witness.resumeWithWitness` |
| Witness: Switch Task | `witness.switchTask` | `witness.startNewTask` |
| Witness: Fix Issue | `witness.fixIssue` | `witness.resolveContinuityIssue` |
| Witness: Update Memory | `witness.updateMemory` | `witness.updateProjectMemoryWithAgent` |
| Witness: Check Memory Update | `witness.checkMemoryUpdate` | `witness.validateArtifactMaintenance` |

Validation result:

- All aliases delegate to existing commands.
- Old command IDs were preserved.
- Advanced commands were not removed.
- Public command count increased intentionally to preserve compatibility.

---

## 6. v8.2 Cheatsheet Validation

v8.2 added:

- source template: `src/templates/CHEATSHEET.md`
- workspace copy: `.witness/CHEATSHEET.md`
- public command: `Witness: Cheatsheet`
- command ID: `witness.cheatsheet`

The cheatsheet answers:

> What should I do now?

Validation result:

- The cheatsheet is copied by the init/enable path through the root template list.
- `Witness: Cheatsheet` opens an existing workspace cheatsheet.
- If `.witness/` exists but the cheatsheet is missing, the command restores it with write-if-missing behavior.
- If `.witness/` is missing, the command tells the user to run `Witness: Start` first.
- The command does not initialize Witness automatically.
- The command does not overwrite an existing user-modified cheatsheet.

---

## 7. v8.3 Status Bar Surface Validation

v8.3 simplified the status bar click menu into these sections:

- Recommended
- Main Actions
- Maintenance
- More Actions

Validation result:

- Recommended remains first.
- Main Actions use workflow aliases.
- Maintenance uses memory commands.
- More Actions preserves original and advanced commands.
- Recommended items normalize to aliases for display, execution, and dedupe.
- Tooltip content remains detailed and unchanged in purpose.

The status bar now behaves more like a workflow guide than a complete command toolbox.

---

## 8. v8.3a Label Validation

v8.3a corrected confusing status bar labels for maintenance issues.

Validated label mapping:

| Case | Label |
|---|---|
| stale project memory / current-state | `Witness: Save Needed` |
| checkpoint maintenance need | `Witness: Save Needed` |
| handover maintenance need | `Witness: Save Needed` |
| `review-subagent-artifacts` | `Witness: Review Needed` |
| critical/red risk | `Witness: Attention` |
| no active session | `Witness: Start` |
| all clear | `Witness: OK` |

The tooltip still carries the detailed reason, such as stale `current-state.md` age or subagent
review evidence.

---

## 9. v8.4 README / Onboarding Validation

v8.4 simplified the first visible documentation around the workflow-first surface.

Validation result:

- README starts with `Witness: Start`.
- `Witness: Cheatsheet` is prominent near the top.
- Old command names are secondary/manual, not the first-use path.
- Status bar docs match the v8 structure: Recommended, Main Actions, Maintenance, More Actions.
- First-run onboarding starts with `Witness: Start`.
- First-run onboarding mentions `Witness: Cheatsheet`.
- First-run onboarding avoids advanced concepts near the top.

---

## 10. v8.5 Command Tier Validation

v8.5 classified Witness commands into six tiers:

- Main user workflows
- Maintenance workflows
- Compatibility / manual names
- Advanced / creator tools
- Subagent / orchestrator tools
- Debug / evaluation tools

Validation result:

- Main user workflows appear first.
- Maintenance workflows appear second.
- Compatibility/manual command names remain documented and are not deprecated.
- `Witness: Create ADR` appears under Advanced / creator tools.
- Subagent commands appear under Subagent / orchestrator tools.
- `Witness: Generate Evaluation Summary` appears under Debug / evaluation tools.

Most users only need Main workflows and occasional Maintenance workflows.

---

## 11. Fresh-User Regression Checklist

| Question | Result |
|---|---|
| Can a new user find the right command in under 30 seconds? | Expected yes: README, onboarding, cheatsheet, and status bar all lead with `Witness: Start`. |
| Can they start without reading architecture docs? | Expected yes: README top and onboarding provide a four-step start flow. |
| Can they save progress without knowing checkpoint terminology? | Expected yes: `Witness: Save Progress` is the beginner name. |
| Can they resume without understanding context packets? | Expected yes: `Witness: Resume` is the beginner name. |
| Can they switch tasks without deleting session files? | Expected yes: `Witness: Switch Task` maps to the safe task-switch workflow. |
| Can they open Cheatsheet when lost? | Expected yes: `Witness: Cheatsheet` is a public command and is prominent in README/onboarding. |
| Are advanced commands still available but not prominent? | Expected yes: advanced commands remain in Command Palette and More Actions, with docs placing them lower. |
| Does status bar feel like workflow menu, not toolbox? | Expected yes: sections are Recommended, Main Actions, Maintenance, More Actions. |

Note: these are documentation/static/mocked-runtime validations, not a human usability study.

---

## 12. Non-Goals Preserved

v8 preserved these non-goals:

- no LLM calls
- no direct provider API
- no automatic prompt injection
- no automatic source-code modification
- no hidden transcript capture
- no hidden reasoning capture
- no advanced command deletion
- no command ID breakage

---

## 13. Known Limitations

- Public command count increased to 40 because aliases preserve compatibility.
- Command Palette still contains advanced commands.
- True hiding or deprioritization depends mainly on README, onboarding, status bar, and walkthrough surfaces.
- No marketplace polish was added.
- No direct coding-agent API integration was added.
- No code graph or context lifecycle OS exists yet.

---

## 14. Final v8 Status

v8 is closed if compile and count checks pass.

Final intended status:

- v8.0 plan complete
- v8.1 aliases complete
- v8.2 cheatsheet complete
- v8.3 status bar surface complete
- v8.3a maintenance label correction complete
- v8.4 README/onboarding simplification complete
- v8.5 command tiers complete
- v8.6 validation report complete

Core v8 principle:

> Users should learn 5 moments, not 40 commands.

