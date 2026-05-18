# ADR-{{NNN}}: {{TITLE}}

Architectural Decision Records capture significant technical decisions along with their context
and consequences. Copy this template to `decisions/ADR-<NNNN>-<slug>.md` and fill it in at the
time the decision is made — not retrospectively.

Good ADRs are short and specific. A decision that can be stated in one sentence, with context in
two paragraphs, is better than a long document that nobody reads.

---

## ADR Number

ADR-{{NNN}}
<!-- Four-digit zero-padded number, e.g. ADR-0001, ADR-0042. The {{NNN}} placeholder name is
     three characters but the substituted value is four digits — `createADR.ts` uses
     `padStart(4, '0')` on the next sequential number. -->

## Title

{{DECISION_TITLE}}
<!-- A short, active-voice statement of the decision, e.g. "Use vscode.workspace.fs for all file I/O" -->

## Date

{{YYYY-MM-DD}}

## Status

{{Proposed / Accepted / Superseded}}
<!-- Proposed: under discussion. Accepted: in effect. Superseded: replaced by ADR-NNNN. -->

<!-- If Superseded, add: Superseded by [ADR-NNNN](./ADR-NNNN-slug.md) -->

---

## Context

<!-- What situation, constraint, or question prompted this decision? Describe the problem space,
     not the solution. What forces are at play? What would happen if no decision were made? -->

{{CONTEXT}}

---

## Decision

<!-- State the decision clearly and directly. What are we doing? This should be unambiguous
     enough that a developer reading it six months later knows exactly what was decided and
     can apply it consistently. -->

{{DECISION}}

---

## Consequences

<!-- What happens as a result of this decision? Include both positive consequences (why this is
     a good decision) and negative consequences (what we give up or what becomes harder). Be
     honest about trade-offs. -->

### Positive

- {{POSITIVE_CONSEQUENCE_1}}
- {{POSITIVE_CONSEQUENCE_2}}

### Negative / Trade-offs

- {{NEGATIVE_CONSEQUENCE_1}}
- {{NEGATIVE_CONSEQUENCE_2}}

---

## Alternatives Considered

<!-- List the other options that were evaluated and briefly explain why they were not chosen.
     This is important: future readers will otherwise re-evaluate the same alternatives. -->

| Alternative | Why Not Chosen |
|-------------|----------------|
| {{ALTERNATIVE_1}} | {{reason}} |
| {{ALTERNATIVE_2}} | {{reason}} |
