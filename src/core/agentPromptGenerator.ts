// ---------------------------------------------------------------------------
// agentPromptGenerator.ts — Witness: centralized coding-agent prompt generator (v5.2).
// ---------------------------------------------------------------------------
//
// Generates copy-ready coding-agent prompts for the Witness beginner commands.
// Centralizes prompt wording so it cannot drift between commands.
//
// Design invariants:
//   - Pure text generation only. No side effects.
//   - Does not open documents.
//   - Does not copy to clipboard.
//   - Does not read the filesystem.
//   - Does not emit telemetry.
//   - Does not include raw telemetry or hidden context.
//   - Does not claim automatic context injection.
//   - No LLM calls.
//   - No runtime dependencies.
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Parameters for {@link generateStartTaskPrompt}.
 */
export interface StartTaskPromptParams {
  /** The task goal entered by the user. */
  taskGoal: string;
}

/**
 * Parameters for {@link generateResumePrompt}.
 */
export interface ResumePromptParams {
  /**
   * Workspace-relative path to the latest reviewed context packet, or null/undefined
   * if no context packet was found. When provided, the path is appended to the
   * prompt body so the coding agent can locate it without manual input.
   */
  contextPacketPath?: string | null;
}

// ---------------------------------------------------------------------------
// Start-task prompt
// ---------------------------------------------------------------------------

/**
 * Generates the copy-ready coding-agent prompt for starting a new task.
 *
 * Instructs the coding agent to read the Witness context files before editing
 * anything and to summarize its understanding before proceeding. The task goal
 * entered by the user is substituted into the "Current task:" section.
 *
 * @param params - {@link StartTaskPromptParams}
 * @returns The full prompt text, ready to paste into any coding agent.
 */
export function generateStartTaskPrompt(params: StartTaskPromptParams): string {
  const { taskGoal } = params;
  return `You are working in this repository with Witness Agent enabled.

First read:
- .witness/index.md
- .witness/current-state.md
- .witness/handovers/latest.md

Current task:
${taskGoal}

Follow .witness/AGENTS.md if available.

## After reading context

1. Summarize the current project state.
2. Propose the next coding plan for this task.
3. Ask the developer to approve or adjust the plan before editing source files.
4. After implementation, remind the developer to run \`Witness: Save Progress\`.

Do not update \`.witness/\` files unless the developer asks you to save progress or update memory.
Do not claim validation passed unless actual validation output exists.`;
}

// ---------------------------------------------------------------------------
// Resume prompt
// ---------------------------------------------------------------------------

/**
 * The fixed base of the resume prompt.
 * Instructs the coding agent to read the Witness default read set and
 * summarize the project state before doing any work.
 */
const BASE_RESUME_PROMPT = `You are resuming work in this repository with Witness Agent.

First read:
- .witness/index.md
- .witness/current-state.md
- .witness/handovers/latest.md

If a reviewed context packet is provided, use it as the primary resume artifact.

Then summarize:
1. current goal
2. completed work
3. unresolved risks
4. relevant subagent outputs
5. next recommended action

Do not scan all .witness files by default.
Do not read raw telemetry unless explicitly asked.
Do not modify files until you confirm the plan with me.`;

/**
 * Generates the copy-ready coding-agent prompt for resuming a Witness project.
 *
 * Uses the standard Witness default read set. If a reviewed context packet path
 * is provided, appends a line pointing the coding agent to it so the agent can
 * load it without the user having to type the path manually.
 *
 * @param params - {@link ResumePromptParams}
 * @returns The full prompt text, ready to paste into any coding agent.
 */
export function generateResumePrompt(params: ResumePromptParams): string {
  const { contextPacketPath } = params;
  if (!contextPacketPath) {
    return BASE_RESUME_PROMPT;
  }
  return `${BASE_RESUME_PROMPT}

A reviewed context packet may be available at: ${contextPacketPath}`;
}
