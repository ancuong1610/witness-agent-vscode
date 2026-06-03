# Witness Cheatsheet

Witness helps your coding agent remember project work.

## Start here

Run:

`Witness: Start`

Then:
1. Answer what you are working on.
2. Copy the generated prompt.
3. Paste it into your coding agent.
4. Approve or adjust the agent's plan.
5. Code normally.
6. When meaningful work is done, run `Witness: Save Progress`.

## What do I use when?

| Situation | Use |
|---|---|
| I am starting work | `Witness: Start` |
| I am switching task | `Witness: Switch Task` |
| I am stopping soon | `Witness: Save Progress` |
| I need current-state placeholders filled | `Witness: Save Progress` |
| I am returning later | `Witness: Resume` |
| Witness warns me | Click the Witness status bar |
| I feel lost | `Witness: Status` |
| My agent updated Witness memory | `Witness: Check Memory Update` |
| I want the one-page guide | `Witness: Cheatsheet` |

## After memory update

1. Let your coding agent update `.witness/`.
2. Run `Witness: Check Memory Update`.
3. Continue coding or run `Witness: Resume` next time.

After your coding agent updates `.witness/`, run `Witness: Check Memory Update`.
Witness will recommend the usual files to check; use manual selection only if needed.

## After finishing work

Run `Witness: Save Progress`.

This should update:
- current project memory
- active session record
- progress/checkpoint information
- important decisions if confirmed

Then run `Witness: Check Memory Update`.

## Status bar

- Hover = details
- Click = recommended action
- Recommended = best next action
- Main Actions = everyday workflow commands
- More Actions = extra/advanced commands

## Do not worry about this at first

- handovers
- context packets
- subagent ledgers
- risk dimensions
- ADRs
- telemetry
- harness protocols

## Safe mental model

Witness is not your coding agent.

Witness does three things:
1. Tracks project memory.
2. Gives your coding agent better prompts.
3. Warns you when project memory needs attention.

Fresh `current-state.md` files start with placeholders. That is expected. After meaningful work,
run `Witness: Save Progress`; it can guide your coding agent to update confirmed project facts.

If a project was created with an older Witness version, run `Witness: Start` and accept the safe support-file upgrade when prompted.
