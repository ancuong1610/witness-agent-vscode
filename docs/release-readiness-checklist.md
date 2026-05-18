# Witness Agent — Release Readiness Checklist

**Version audited:** 0.1.0  
**Audit date:** 2026-05-18  
**Compile status:** ✅ CLEAN (`npm run compile` — zero TypeScript errors)  
**Overall verdict:** ✅ Ready for VSIX private beta · ❌ Not yet ready for public Marketplace

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Present and acceptable |
| ⚠️ | Present but needs attention before Marketplace |
| ❌ | Missing — must be resolved before Marketplace |
| 🔒 | Locked by design (intentional absence) |

---

## Section 1 — package.json Marketplace Metadata

| Field | Status | Notes |
|-------|--------|-------|
| `name` | ✅ | `witness-agent` — URL-safe, lowercase, no spaces |
| `displayName` | ✅ | `"Witness Agent"` — clear, human-readable |
| `description` | ✅ | Accurate one-liner describing repo-local `.witness/` continuity system |
| `version` | ✅ | `0.1.0` — valid semver, appropriate for private beta |
| `publisher` | ⚠️ | `"witness-agent"` — placeholder. Must match a verified Marketplace publisher ID before public release. Register at https://marketplace.visualstudio.com/manage |
| `engines.vscode` | ✅ | `^1.85.0` — targets VS Code January 2024+; broad compatibility |
| `categories` | ✅ | `["Other", "AI"]` — accurate |
| `keywords` | ✅ | `["copilot", "context", "handover", "ai-coding", "witness"]` — 5 keywords, good discoverability |
| `repository` | ❌ | Field entirely absent from `package.json`. Required for Marketplace. Add: `"repository": { "type": "git", "url": "https://github.com/<org>/witness-agent-vscode" }` |
| `license` | ✅ | `"MIT"` — declared in `package.json`, LICENSE file present and correct |
| `icon` | ❌ | Field absent. A PNG icon ≥ 128×128 px is required before Marketplace listing. Add: `"icon": "images/icon.png"` and create the asset. |
| `galleryBanner` | ❌ | Field absent. Recommended for Marketplace polish. Add: `"galleryBanner": { "color": "#1e1e1e", "theme": "dark" }` (adjust to brand color) |
| `activationEvents` | ✅ | 24 entries: `workspaceContains:.witness/index.md` (auto-activation) + 23 `onCommand:witness.*` entries. Count matches public command surface. |
| `contributes.commands` count | ✅ | 23 public commands declared. Matches implementation. `witness.openStatusActions` is internal (status bar only) and correctly absent from contributes. |
| `main` entry | ✅ | `"./out/extension.js"` — points to compiled output |
| `scripts.vscode:prepublish` | ✅ | `"npm run compile"` — triggers clean compile before packaging |
| `scripts.compile` | ✅ | `"tsc -p ./"` |
| `scripts.watch` | ✅ | `"tsc -watch -p ./"` |
| `scripts.lint` | ❌ | No lint script. Recommended: add `eslint` with `@typescript-eslint` before Marketplace. Not a blocker for private beta. |
| `scripts.test` | ❌ | No test script. The `test/` folder exists but contains only `.gitkeep`. Marketplace does not require tests, but automated regression coverage is strongly recommended before public release. |

**package.json blockers for Marketplace:** `repository`, `icon`, `galleryBanner`, verified `publisher`.

---

## Section 2 — Required and Recommended Files

| File | Status | Notes |
|------|--------|-------|
| `README.md` | ⚠️ | ✅ Exists and is substantive (412 lines). ⚠️ Installation section currently describes only F5 development mode. Must add VSIX install instructions and eventually Marketplace install instructions before public release. |
| `CHANGELOG.md` | ❌ | **Missing.** The VS Code Marketplace displays a changelog tab. Its absence is a blocker for any public listing. Create `CHANGELOG.md` with at minimum a `## [0.1.0]` entry. |
| `LICENSE` | ✅ | MIT, present, correct copyright year and holder |
| `SUPPORT.md` | ❌ | Missing. Recommended for Marketplace extensions. Should describe how to file issues, expected response time, and whether commercial support exists. Not a hard blocker for private beta. |
| `.vscodeignore` | ⚠️ | ✅ Exists. ⚠️ `node_modules/` is not explicitly excluded. `vsce` excludes `node_modules` by default when the extension has no runtime `dependencies`, but the explicit exclusion should be added to keep VSIX size minimal and the intent clear. Add `node_modules/**` to `.vscodeignore`. |
| Icon PNG ≥ 128×128 | ❌ | No icon asset exists anywhere in the repository. Required for Marketplace. Recommended: create `images/icon.png` at exactly 128×128 px (PNG, transparent background acceptable). |
| `package-lock.json` | ✅ | Present. Ensures reproducible installs. |
| `tsconfig.json` | ✅ | Present. Excluded from VSIX by `.vscodeignore` via `**/tsconfig.json`. |
| `.gitignore` | ✅ | Present. |

---

## Section 3 — Packaging Checks

These steps must all pass before private beta distribution. Steps marked 🔒 are intentionally skipped.

```
# Step 1 — Install dependencies
npm install

# Step 2 — Compile (validated above)
npm run compile

# Step 3 — Pre-publish hook (runs compile again; validates the hook exists)
npm run vscode:prepublish

# Step 4 — Lint (not yet configured — skip for private beta, required before Marketplace)
# npm run lint

# Step 5 — Tests (not yet configured — skip for private beta)
# npm test

# Step 6 — Package as VSIX
npx @vscode/vsce package

# Step 7 — Install VSIX locally
code --install-extension witness-agent-0.1.0.vsix

# Step 8 — Smoke test: auto-activation
#   Open a workspace that already contains .witness/index.md
#   Expected: Witness status bar item appears without running any command

# Step 9 — Smoke test: Resolve Continuity Issue flow
#   From the status bar QuickPick, select "Resolve: <issue>"
#   Expected: unsaved markdown resolver tab opens with four sections,
#   then QuickPick presents action choices; no write occurs until selection
```

| Check | Target state for private beta | Target state for Marketplace |
|-------|-------------------------------|------------------------------|
| `npm install` | ✅ clean | ✅ clean |
| `npm run compile` | ✅ **confirmed clean** | ✅ clean |
| `npm run vscode:prepublish` | ✅ runs compile | ✅ clean |
| `npm run lint` | 🔒 not configured | ❌ must be added |
| `npm test` | 🔒 not configured | ❌ must be added |
| `npx @vscode/vsce package` | ❌ **not yet run** — run before distributing | ✅ must pass cleanly |
| Install VSIX locally | ❌ **not yet confirmed** | ✅ must pass |
| Auto-activation smoke test | ❌ **not yet confirmed in packaged form** | ✅ must pass |
| Resolve Continuity Issue smoke test | ❌ **not yet confirmed in packaged form** | ✅ must pass |

> **Note on `.vscodeignore` and VSIX size:** Because the extension has no runtime `dependencies` (only `devDependencies`), `node_modules` should not appear in the VSIX. Verify after running `vsce package` by inspecting the generated `.vsix` with `unzip -l witness-agent-0.1.0.vsix`. The VSIX should contain only `out/`, `src/templates/`, and top-level metadata files.

---

## Section 4 — Privacy and Security Checks

| Check | Status | Notes |
|-------|--------|-------|
| No raw chat transcript capture | ✅ | Confirmed by design lock (v3-locked). No chat content is written to any artifact. |
| No hidden reasoning capture | ✅ | Confirmed by design lock (v3-locked). The extension has no mechanism to read model internals. |
| No automatic coding-agent context injection | ✅ | Confirmed by design lock. Context packets are developer-reviewed; the developer loads them manually. |
| No external network calls | ✅ | Extension makes no HTTP requests. All I/O is local filesystem reads and writes within the workspace. No analytics endpoints, no license servers, no telemetry upload. |
| Telemetry is local JSONL only | ✅ | `.witness/telemetry/otel/events.jsonl` is a local append-only file. Schema is OTel-compatible. Contents: timestamps, command IDs, session IDs, status codes, durations, artifact paths. No prompt text, file contents, or user data. |
| `.witness/` artifacts are repo-local | ✅ | All artifacts are written inside the workspace under `.witness/`. Nothing is written outside the workspace root. |
| No secrets written intentionally | ✅ | No token, PAT, API key, or credential is read, generated, or stored by any command. |
| No token/PAT stored in repo | ✅ | `.gitignore` present. No credential files referenced by any source file. |

### Privacy Position Statement

> **Witness Agent detects observable continuity degradation from repo-local `.witness/` artifacts. It does not directly inspect hidden model context, chat transcripts, or true token pressure.**

This statement must appear in the Marketplace description, the README, and the SUPPORT document.

---

## Section 5 — Release Positioning

Witness Agent occupies a narrow, well-defined position in the AI-assisted coding tool landscape:

- **What it is:** A repo-local continuity and context-control layer for developers using AI coding agents (Claude Code, GitHub Copilot, Codex, Cursor, etc.).
- **What it is not:** A coding agent, a token counter, a context-injection tool, or a replacement for any AI coding assistant.
- **The core claim:** Witness Agent externalizes project state, decisions, subagent evidence, handovers, and validation artifacts into `.witness/` so that a fresh AI session can resume reliably. It tracks five observable continuity risk dimensions and surfaces actionable guidance without writing anything until the developer confirms.
- **The boundary:** *Automatic* — observe, classify, warn, suggest. *Confirmed* — write, review, compress, generate handover, switch session.

**Required disclaimer for all public-facing copy:**

> Witness Agent detects observable continuity degradation from repo-local `.witness/` artifacts. It does not directly inspect hidden model context, chat transcripts, or true token pressure.

---

## Section 6 — Marketplace Description Draft

### Short description (≤ 128 characters)

```
Repo-local continuity layer for AI coding sessions. Tracks context degradation. Guides safe handovers.
```
*(100 characters)*

### Long description

```markdown
## Witness Agent

Witness Agent is a background continuity layer for AI-assisted coding. It monitors a
repo-local `.witness/` directory, tracks five continuity risk dimensions, and surfaces
the next safe action when a session needs attention.

**The problem it solves:** Every AI coding session is ephemeral. When a session ends,
the model loses all working memory — decisions made, files mid-edit, subagent history,
architectural constraints. Without an external record, every new session starts blind.

**What Witness does:** Witness Agent externalizes project state, decisions, subagent
evidence, handovers, and validation artifacts into `.witness/` alongside your code.
A fresh AI session reads three files and resumes reliably.

### Key Features

- **Five-dimension risk assessment** — Active Context Pressure, Artifact Externalization
  Gap, Subagent Boundary Risk, Quality Drift, Phase Boundary Risk
- **Continuity Resolver** — click the status bar, read a plain-language explanation of
  what happened and why it matters, then choose an action from a guided QuickPick
- **Subagent Ledger (v2)** — five-stage lifecycle tracking for delegated subagent tasks:
  contract → context packet → evidence → completion report → orchestrator review
- **Local OTel telemetry** — structured JSONL event log; never uploaded, never shared
- **Handover generation and validation** — produce and validate handover documents before
  switching sessions
- **Auto-activation** — status bar appears automatically in any workspace that contains
  `.witness/index.md`; no manual setup required after initialization

### How It Works

1. Run `Witness: Initialize Project` once in your workspace.
2. The status bar shows current continuity state.
3. When a risk is detected, click the status bar and select `Resolve: <issue>`.
4. A plain-language explanation opens. Choose an action. Witness writes nothing until
   you confirm.

### Limitations

> Witness Agent detects observable continuity degradation from repo-local `.witness/`
> artifacts. It does not directly inspect hidden model context, chat transcripts, or
> true token pressure.

- Does not write code or communicate with any AI backend.
- Does not automatically inject context into AI sessions.
- Does not guarantee token reduction.
- Does not replace GitHub Copilot, Claude Code, Codex, or any coding agent.
- Telemetry is local only — `.witness/telemetry/otel/events.jsonl` — and is never
  transmitted.

### Who It Is For

- Developers who use AI coding agents (Claude Code, GitHub Copilot, Codex, Cursor, etc.)
  on multi-session projects.
- Teams that need an auditable, version-controlled record of AI session decisions,
  subagent invocations, and handovers.
- Anyone who has lost context at a session boundary and wants a structured way to prevent it.

---

⚠️ **Private beta — not yet stable for production workflows.** Command surface and
artifact schemas may change before v1.0. Please file issues at [repository URL].
```

---

## Section 7 — VSIX Pilot Plan

### Target testers (3–5)

Recruit testers who represent the core use case: developers actively using an AI coding agent on a multi-session project.

| Tester profile | Rationale |
|----------------|-----------|
| Solo developer, Claude Code user, >1 project | Primary use case validator |
| Solo developer, GitHub Copilot user | Cross-tool compatibility check |
| Developer with subagent delegation workflow | v2 Subagent Ledger validator |
| Developer on a team project (shared repo) | `.witness/` in version control stress test |
| Developer who has never used Witness before | Cold-start UX and onboarding check |

### Feedback collection areas

Collect **anonymized qualitative feedback** only. Do not collect raw project files, `.witness/` contents, or any artifact text.

| Area | Questions to ask |
|------|-----------------|
| **Setup** | How long did initialization take? Was `Witness: Initialize Project` self-explanatory? Did the status bar appear without prompting? |
| **Status bar** | Did you understand what the status bar label meant? Was the risk level accurate for your session state? |
| **Resolver clarity** | Did the resolver explanation (four-section markdown tab) make sense? Did it accurately describe the issue? Would you have taken the suggested action without the explanation? |
| **Subagent flow** | Did the five-stage Subagent Ledger lifecycle feel complete? Did the contract/evidence/review model match your actual workflow? |
| **Handover / context packet usefulness** | Did the generated handover contain enough information to resume safely? Did the context packet assembly (`Witness: Create Context Packet`) produce a useful artifact? |
| **Overall friction** | Which commands felt redundant? Which felt missing? What would you remove? |

### Success criteria for private beta

| Criterion | Target |
|-----------|--------|
| Status bar auto-activation in initialized workspace | 5/5 testers: appears without manual command |
| Resolver explanation rated "clear" or "mostly clear" | ≥ 4/5 testers |
| At least one complete handover generated and validated per tester session | ≥ 3/5 testers |
| No crash or unhandled error during tester workflow | 5/5 testers |
| At least one actionable improvement per tester identified | — (all feedback is useful) |

### Privacy during pilot

- Do not ask testers to share `.witness/` artifacts, telemetry files, or project code.
- Collect feedback via structured questionnaire or short async interview.
- All feedback is attributed to a tester ID, not a real name or email, in any internal analysis.

---

## Section 8 — Release Blockers

### Blockers that must be resolved before public Marketplace listing

| # | Blocker | Severity | Description |
|---|---------|----------|-------------|
| 1 | **Missing verified publisher** | 🔴 Hard blocker | `"publisher": "witness-agent"` is a placeholder. Must register and verify a publisher ID at https://marketplace.visualstudio.com/manage before running `vsce publish`. |
| 2 | **Missing icon** | 🔴 Hard blocker | No PNG icon asset exists. `vsce package` will warn; Marketplace listing will use a generic placeholder icon, which hurts discoverability. Create `images/icon.png` at ≥ 128×128 px and add `"icon": "images/icon.png"` to `package.json`. |
| 3 | **Missing CHANGELOG.md** | 🔴 Hard blocker | The Marketplace displays a Changelog tab. The absence of `CHANGELOG.md` is a user-facing gap. Create with a `## [0.1.0] — 2026-05-18` entry summarizing the v1–v4 command surface. |
| 4 | **Missing `repository` field in package.json** | 🔴 Hard blocker | Required for Marketplace attribution and source link. Add `"repository": { "type": "git", "url": "..." }`. |
| 5 | **Weak README install instructions** | 🟠 Soft blocker | Current README describes only F5 development mode. Must add: (a) VSIX install via `code --install-extension`, (b) Marketplace install via Extensions panel, before public listing. |
| 6 | **No VSIX smoke test** | 🟠 Soft blocker | `vsce package` has not been run. The generated VSIX has not been installed and tested in a clean VS Code instance. Must be done before distributing to beta testers. |
| 7 | **No fresh-workspace regression test** | 🟠 Soft blocker | Extension has not been tested starting from a workspace with no `.witness/` directory (cold start), then initializing and running through the full command surface. Required before private beta distribution. |
| 8 | **Unclear privacy statement placement** | 🟠 Soft blocker | The privacy position statement exists in the README but is not prominently placed. It must appear: (a) in the Marketplace long description, (b) near the top of the README, (c) in SUPPORT.md once created. |
| 9 | **`node_modules/` not excluded in .vscodeignore** | 🟡 Low severity | vsce excludes node_modules by default for extensions with no runtime dependencies, but explicit exclusion is best practice. Add `node_modules/**` to `.vscodeignore`. |
| 10 | **Missing SUPPORT.md** | 🟡 Low severity | Not a Marketplace requirement but expected by professional extensions. Describes issue filing, response expectations, and commercial support status. |
| 11 | **Missing `galleryBanner` in package.json** | 🟡 Low severity | Cosmetic. Marketplace listing will use a plain white background. Add `"galleryBanner": { "color": "#1e1e1e", "theme": "dark" }`. |
| 12 | **No lint configuration** | 🟡 Low severity | No `eslint` or similar configured. Not required for packaging but recommended for code quality and Marketplace peer review expectations. |
| 13 | **No automated tests** | 🟡 Low severity | `test/` directory exists with only `.gitkeep`. No regression coverage. Not required for private beta but should be addressed before Marketplace. |

### Summary counts

| Severity | Count |
|----------|-------|
| 🔴 Hard blockers (Marketplace) | 4 |
| 🟠 Soft blockers (required before beta or Marketplace) | 4 |
| 🟡 Low severity (recommended before Marketplace) | 5 |

**Hard blockers 1–4 must all be resolved before running `vsce publish`.**  
**Soft blockers 6 and 7 must be resolved before distributing any VSIX to testers.**

---

## Section 9 — Commands to Run

Run these commands in order from the project root. Do not run `vsce publish`.

```bash
# 1. Ensure dependencies are current
npm install

# 2. Compile TypeScript (validated clean as of 2026-05-18)
npm run compile

# 3. Run pre-publish hook (runs compile; validates the hook works)
npm run vscode:prepublish

# 4. Package as VSIX
#    Requires: @vscode/vsce installed globally or via npx
npx @vscode/vsce package

# 5. Inspect VSIX contents (verify node_modules absent, templates present)
unzip -l witness-agent-0.1.0.vsix

# 6. Install VSIX locally for smoke testing
code --install-extension witness-agent-0.1.0.vsix

# 7. Smoke test — auto-activation
#    Open a workspace containing .witness/index.md
#    Verify: status bar Witness item appears without running any command

# 8. Smoke test — Resolve Continuity Issue
#    Click status bar → select "Resolve: <issue>" (or run Witness: Resolve Continuity Issue)
#    Verify: unsaved markdown tab opens with four sections
#    Verify: QuickPick presents action choices
#    Verify: no file is written until an action is explicitly selected

# 9. DO NOT RUN — not until hard blockers 1–4 are resolved
# npx @vscode/vsce publish
```

---

## Section 10 — Final Recommendation

### ✅ Ready for VSIX private beta

The extension compiles cleanly, has 23 implemented public commands, correct activation logic, a substantive README, a valid MIT license, and a fully present `.vscodeignore`. The architecture is sound. The automatic/confirmed boundary is well-defined and privacy-respecting.

The extension is ready to be packaged as a VSIX and distributed to 3–5 controlled testers **once soft blockers 6 and 7 are resolved** (VSIX smoke test and fresh-workspace regression test).

### ❌ Not yet ready for public Marketplace

Four hard blockers must be resolved first:

1. Verify or register a Marketplace publisher ID and update `"publisher"` in `package.json`.
2. Create a PNG icon ≥ 128×128 px and add `"icon"` to `package.json`.
3. Create `CHANGELOG.md` with a `[0.1.0]` entry.
4. Add `"repository"` to `package.json`.

After the hard blockers are resolved, complete the soft blockers (install instructions in README, VSIX smoke test, fresh-workspace regression), then run `npx @vscode/vsce package` again and proceed to Marketplace submission.

---

## Appendix — Audit Findings Summary Table

| Area | Finding | Action required |
|------|---------|-----------------|
| `package.json` | `repository` missing | Add before Marketplace |
| `package.json` | `icon` missing | Add + create asset before Marketplace |
| `package.json` | `galleryBanner` missing | Add before Marketplace (cosmetic) |
| `package.json` | `publisher` placeholder | Verify Marketplace identity before publish |
| `package.json` | No `lint` script | Add before Marketplace |
| `package.json` | No `test` script | Add before Marketplace |
| `CHANGELOG.md` | Missing | Create before Marketplace |
| `SUPPORT.md` | Missing | Create before Marketplace |
| Icon PNG | Missing | Create before Marketplace |
| `.vscodeignore` | `node_modules/` not explicit | Add `node_modules/**` |
| `README.md` | Install instructions incomplete | Add VSIX + Marketplace steps |
| VSIX smoke test | Not yet run | Run before beta distribution |
| Fresh-workspace regression | Not yet run | Run before beta distribution |
| Compile | ✅ Clean | No action |
| License | ✅ MIT, correct | No action |
| Privacy model | ✅ Local-only, no external calls | Confirm placement in all public copy |
| Command count | ✅ 23 public, 1 internal | No action |
| Activation events | ✅ 24 (correct) | No action |
| `vscode:prepublish` hook | ✅ Present | No action |
| `package-lock.json` | ✅ Present | No action |
