# Witness Harness — Session Switch Protocol

Use this protocol when the developer is ending a session and preparing a handover, or when
resuming work after a session boundary.

---

## Part A — Before Ending or Switching a Session

Before the developer ends a session where meaningful work was done, the following artifacts
must be produced. You may assist in preparing the content, but the developer must run each
command.

### Required steps, in order:

**1. Generate Handover**
The developer runs `Witness: Generate Handover`. This produces:
- `.witness/handovers/handover-<session-id>-NNN.md`
- `.witness/handovers/latest.md`

You may assist by summarizing what was completed, what is still open, and what the next session
should address first. Provide this summary to the developer before they run the command. Do not
generate or modify the handover file yourself.

**2. Validate Handover**
The developer runs `Witness: Validate Handover` immediately after generation. A handover passes
only when it has zero `[ERROR]` markers. If it fails, assist the developer in identifying what
content is missing, then re-validate.

Do not hand an unvalidated handover to a fresh session.

**3. Create Resume Probe** (for high-stakes handoffs)
For sessions with significant decisions or complex state, the developer runs
`Witness: Create Resume Probe`. This generates a quiz for a fresh agent to answer before
editing. Assist by suggesting probe questions that would surface whether a fresh agent
correctly understood the key decisions made in this session.

**4. Create Context Packet**
The developer runs `Witness: Create Context Packet`. This assembles the reviewed packet for
the next session. Check the embedded validation checklist in the packet. If mandatory markers
remain, report them before the packet is used.

---

## Part B — On Session Resume

When resuming after a session boundary, follow this sequence before editing:

**1. Load the read set:**
- `.witness/index.md`
- `.witness/current-state.md`
- `.witness/handovers/latest.md`
- Latest context packet, if provided by the developer

Do not load the full `.witness/` directory. Do not load telemetry. Load ADRs and subagent
entries only if the task specifically requires them.

**2. Answer the resume probe:**
If the developer provides a resume probe (`.witness/sessions/<id>-resume-probe-NNN.md`),
answer it before making any edits. The probe tests whether you have correctly understood the
state captured in the handover. Do not proceed if your answers to the probe indicate you are
missing critical context.

**3. Confirm no blocking issues:**
Check whether the loaded artifacts reference any blocking issues:
- Unresolved validation errors in the handover
- Unresolved mandatory markers in the context packet
- A blocked or failed subagent whose work is a dependency
- A RED or BLOCKED risk level

If blocking issues exist, follow `.witness/harness/continuity-issue.md` before proceeding.

**4. Confirm the next safe step:**
State the single next action to take, sourced from the handover or context packet. Do not
improvise if one is provided.

---

## Constraints

- Do not generate or modify handovers autonomously. The developer runs `Witness: Generate Handover`.
- Do not switch sessions without developer initiation.
- Do not use an unreviewed context packet as the resume artifact.
- Do not skip the resume probe if the developer provides one.
- Do not load all `.witness/` files as a shortcut to avoid reading the context packet.
