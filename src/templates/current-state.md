# Current State

This is the single source of truth for where this project is right now. Keep it current. Every
handover reads from this file, and every fresh Copilot session should read it before taking any
action. If this file is stale, handovers will be stale.

Update this file at the end of every session or whenever the state meaningfully changes.

---

## Project

**Name**: {{PROJECT_NAME}}

**Repository**: {{REPO_URL_OR_PATH}}

**Brief description**: {{ONE_SENTENCE_DESCRIPTION}}

---

## Current Phase

<!-- Examples: "Initial scaffolding", "Feature development — auth module", "Pre-release hardening" -->

{{CURRENT_PHASE}}

---

## Last Updated

**Date**: {{YYYY-MM-DD}}

**Updated by session**: {{SESSION_ID}}

---

## Active Slice / Feature

<!-- What is the current unit of work? A vertical slice, a feature branch, a specific bug fix? -->

{{ACTIVE_SLICE_OR_FEATURE}}

---

## Key Constraints

<!-- List constraints that a fresh session must not violate. Architecture decisions, library
     choices, off-limits approaches, performance requirements, etc. Reference ADRs where relevant. -->

- {{CONSTRAINT_1}}
- {{CONSTRAINT_2}}

---

## Recently Completed

<!-- What was finished in the last 1-2 sessions? Brief, outcome-focused. -->

- {{RECENTLY_COMPLETED_1}}
- {{RECENTLY_COMPLETED_2}}

---

## In Progress

<!-- What work is currently mid-flight? Include file names if specific files are mid-edit. -->

- {{IN_PROGRESS_1}} (files: {{FILES}})
- {{IN_PROGRESS_2}}

---

## Next Safe Step

<!-- The single most important thing a fresh session should do first. Be specific. -->

{{NEXT_SAFE_STEP}}

---

## What Not To Do

<!-- Explicit prohibitions for a fresh session. Things that look tempting but are wrong for this
     project right now. -->

- Do not {{PROHIBITED_ACTION_1}} because {{REASON}}
- Do not {{PROHIBITED_ACTION_2}} because {{REASON}}

---

## Open Questions

<!-- Unresolved decisions, things that need human input, or threads that are deliberately parked. -->

- {{OPEN_QUESTION_1}}
- {{OPEN_QUESTION_2}}
