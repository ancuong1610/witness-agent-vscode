// ---------------------------------------------------------------------------
// onboardingContent.ts — Witness: first-run onboarding page generator (v5.3).
// ---------------------------------------------------------------------------
//
// Generates the beginner-friendly onboarding markdown page shown after a
// first-time `Witness: Enable for This Project`.
//
// Design invariants:
//   - Pure text generation only. No side effects.
//   - Does not open documents.
//   - Does not copy to clipboard.
//   - Does not read the filesystem.
//   - Does not emit telemetry.
//   - Does not explain the full methodology.
//   - Does not list all commands.
//   - No LLM calls. No runtime dependencies.
//
// ---------------------------------------------------------------------------

/**
 * Generates the beginner-friendly first-run onboarding markdown page.
 *
 * Covers what Witness does, the next step, the beginner workflow, the
 * copy-ready prompt behavior, what to ignore for now, a short command list,
 * and pointers to advanced docs. Intentionally short — no full methodology.
 *
 * @returns The full onboarding page as a markdown string.
 */
export function generateFirstRunOnboarding(): string {
  return `# Witness is Enabled

## What Witness Does

Witness keeps project memory for AI-assisted coding work. It writes continuity
artifacts into \`.witness/\` so your coding agent can resume a project without
losing context between sessions.

You keep coding normally with Copilot, Claude Code, Codex, Superpowers, or
another coding agent. Witness runs alongside it.

Witness is not your coding agent. It helps your coding agent remember the
project safely.

---

## Next Step

**Run: Witness: Start Tracking This Task**

This starts a repo-local Witness work record for what you are about to do.

- It is not the same as starting a new Copilot/Claude/Codex chat.
- You only need to answer one question: "What are you working on?"
- Witness writes the session record to \`.witness/sessions/\`. Your files are
  not changed.

---

## Beginner Workflow

1. Enable Witness. (Done.)
2. Run **Start Tracking This Task** and describe your goal.
3. Code normally with your coding agent.
4. If the status bar warns you, click it and choose **Resolve Continuity Issue**.
5. Before stopping for the day, run **Create Checkpoint** or **Prepare Session Switch**.
6. Next time, run **Resume with Witness** to get a prompt that reloads project context.

---

## Copy-Ready Prompt

After you run **Start Tracking This Task**, Witness opens a short prompt in a
new tab. Paste that prompt into your coding agent at the start of your session.
The prompt tells the agent which Witness files to read before doing any work.

You do not need to write this prompt yourself. Witness generates it for you.

---

## What Not To Worry About Yet

You do not need to understand these to get started:

- handovers
- context packets
- subagent ledgers
- risk dimensions
- telemetry
- harness protocols

These are available when you need them. Start simple.

---

## Useful Commands

Open the Command Palette (\`Cmd+Shift+P\` / \`Ctrl+Shift+P\`) and type \`Witness\`:

- **Witness: Start Tracking This Task** — begin a work record for your current goal
- **Witness: Create Checkpoint** — save a continuity snapshot before stopping
- **Witness: Resume with Witness** — generate a resume prompt for your next session
- **Witness: Resolve Continuity Issue** — fix the top continuity problem Witness found

---

## Advanced Docs

- \`README.md\` — full command reference and architecture overview
- \`docs/workflow.md\` — step-by-step session workflow
- \`docs/architecture.md\` — how the artifact system works
`;
}
