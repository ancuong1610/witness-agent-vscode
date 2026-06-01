// ---------------------------------------------------------------------------
// onboardingContent.ts — Witness: first-run onboarding page generator (v8.4).
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
//   - Does not emit events.
//   - Does not explain the full methodology.
//   - Does not list all commands.
//   - No LLM calls. No runtime dependencies.
//
// ---------------------------------------------------------------------------

/**
 * Generates the beginner-friendly first-run onboarding markdown page.
 *
 * Covers the v8 workflow-first command surface, the next step, a visual
 * workflow, status bar behavior, and pointers to the cheatsheet. Intentionally
 * short — no full methodology.
 *
 * @returns The full onboarding page as a markdown string.
 */
export function generateFirstRunOnboarding(): string {
  return `# Witness is Enabled

Witness helps your AI coding sessions remember what matters.

## Start

Run:

**Witness: Start**

Then:
1. Answer what you are working on.
2. Paste the generated prompt into your coding agent.
3. Code normally.

Lost? Run **Witness: Cheatsheet**.

---

## Visual Workflow

\`\`\`text
Open project
  |
  v
Witness: Start
  |
  v
Paste prompt into coding agent
  |
  v
Code normally
  |
  v
Click the Witness status bar when it recommends action
  |
  +--> Witness: Save Progress before stopping
  |
  +--> Witness: Resume when returning later
  |
  +--> Witness: Switch Task when moving to another task
\`\`\`

---

## Status Bar

The Witness status bar is your guide.

- Hover for details.
- Click for the recommended action.
- **Recommended** is the best next action.
- **Main Actions** are everyday workflow commands.
- **Maintenance** is for updating and checking Witness memory.
- **More Actions** contains advanced commands.

---

## Main Commands

- **Witness: Start** — begin AI-assisted work.
- **Witness: Save Progress** — save project memory before stopping.
- **Witness: Resume** — return in a later coding-agent session.
- **Witness: Switch Task** — move to another task safely.
- **Witness: Fix Issue** — follow up when Witness warns.
- **Witness: Status** — see what is happening.
- **Witness: Cheatsheet** — open the one-page guide.

---

## Boundaries

Witness is not your coding agent. It does not call an LLM directly and does not inject prompts
automatically. You review the prompt, paste it into your coding agent, and stay in control.

---

## More Help

- **Witness: Cheatsheet** opens \`.witness/CHEATSHEET.md\`.
- Advanced commands are still available under **More Actions**.
- \`README.md\` has the full first-user guide.
`;
}
