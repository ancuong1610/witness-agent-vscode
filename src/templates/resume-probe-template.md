# Resume Probe: {{PROBE_ID}}

A resume probe is a structured quiz used to verify that a fresh Copilot session can correctly
answer key continuity questions after reading a handover package. The probe is run by a human: ask
a fresh session each question below (without allowing it to re-read more than the Default Read
Set), then compare answers against the Expected Answers section.

If the fresh session fails two or more questions, the handover is not complete enough. Return to
the handover, strengthen the weak sections, and run the probe again.

Copy this template to `evaluation/resume-probe-<session-id>.md`.

---

## Probe ID

{{PROBE_ID}}
<!-- Format: resume-probe-YYYY-MM-DD-NNN, e.g. resume-probe-2026-05-12-001 -->

## Source Handover

{{HANDOVER_ID}}
<!-- The handover this probe is evaluating, e.g. handover-2026-05-12-001 -->

## Probe Run At

{{YYYY-MM-DDTHH:MM:SSZ}}

---

## Questions To Ask Fresh Session

Ask the fresh session each of these questions in sequence after it has read only the Default Read
Set (constitution.md, current-state.md, the handover, and the ADRs linked from the handover).
Do not allow it to read session logs, subagent reports, or other artifacts during the probe.

1. **What is the next safe step?**
   Ask this first. The answer should match the "Next Safe Step" section of the handover exactly
   or closely. Paraphrasing is acceptable; omitting key specifics is not.

2. **Which files (if any) are mid-edit or in an inconsistent state?**
   The answer should match the "Files In Flight" table in the handover.

3. **What was the most recent validation result, and when was it run?**
   The answer should include the type, result (passed/failed/not run), and approximate timestamp.

4. **{{CUSTOM_QUESTION_ABOUT_KEY_DECISION}}**
   Replace this with a question specific to the most important architectural decision in the
   current ADR set. For example: "Why are we using vscode.workspace.fs instead of Node's fs?"

5. **What are the explicit prohibitions for this session — what must the fresh session NOT do?**
   The answer should match the "What Not To Do" entries in both the handover and current-state.md.

6. **{{CUSTOM_QUESTION_ABOUT_ACTIVE_CONSTRAINT}}**
   Replace this with a question about a specific constraint from current-state.md or the handover
   that is easy to violate. For example: "What library choice is locked in for file I/O and why?"

7. **What is the current overall continuity risk level, and which dimension drove it?**
   The answer should match the recommended risk level and the highest-rated dimension from the
   handover's risk assessment table.

---

## Expected Answers

Fill in the correct answers here before running the probe. This makes grading faster and more
consistent — you should not be constructing the expected answers during the probe session.

1. **Next safe step**: {{EXPECTED_ANSWER_1}}

2. **Files in flight**: {{EXPECTED_ANSWER_2}}

3. **Last validation**: {{EXPECTED_ANSWER_3}}

4. **{{KEY_DECISION_SHORT}}**: {{EXPECTED_ANSWER_4}}

5. **Prohibitions**: {{EXPECTED_ANSWER_5}}

6. **{{ACTIVE_CONSTRAINT_SHORT}}**: {{EXPECTED_ANSWER_6}}

7. **Risk level and driving dimension**: {{EXPECTED_ANSWER_7}}

---

## Pass / Fail Criteria

**Passing threshold**: The fresh session must answer at least 5 of 7 questions correctly.
Questions 1, 2, and 5 (next step, files in flight, prohibitions) are mandatory — a wrong answer
on any of these is an automatic failure regardless of total score.

**What "correct" means**: The answer captures the key facts without introducing inaccuracies.
Minor wording differences are acceptable. Missing a critical detail (e.g., a specific file name
listed as mid-edit) is a failure for that question.

---

## Result

**Date probed**: {{YYYY-MM-DD}}

**Questions passed**: {{N}} / 7

**Mandatory questions passed**: {{yes / no}} (Q1, Q2, Q5)

**Overall result**: {{PASS / FAIL}}

**Notes on failures** (if any):
{{NOTE_WHAT_FAILED_AND_WHY}}

**Action taken**: {{handover accepted / handover revised — see handover v2 / probe re-run}}
