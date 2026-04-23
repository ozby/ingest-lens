---
type: guide
last_updated: "2026-04-22"
---

# Lore Commit Protocol

A **Lore commit** is a commit that encodes an architectural decision,
constraint, or deliberate trade-off directly in the git history. The hook enforces the trailer baseline for every commit; `[lore]` remains a useful
subject marker for commits that are primarily architectural decision records.

Everyday feature commits can keep short bodies, but they still need the minimum
Lore trailer evidence required by the hook.

## When to use `[lore]`

Use `[lore]` when:

- You are making or reversing a non-trivial design decision
- You explicitly rejected one or more alternatives
- You want future maintainers to understand the confidence level and
  reversibility of a choice

Do **not** use `[lore]` for:

- Routine bug fixes, formatting, dependency bumps, test updates
- Anything already documented in a linked ADR (link to the ADR instead via
  `Related:`)

## Trailer Vocabulary

All trailers follow the `git interpret-trailers` key-colon-space-value
convention. The `[lore]` validator (see `ak audit commit-message`)
requires `Confidence:` plus at least one of `Constraint:`, `Rejected:`, or
`Directive:`.

### Required for every commit

| Trailer                           | Description                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| `Confidence: <low\|medium\|high>` | How certain the author is that this is the right call today. |

### Constraint / Alternatives / Direction

| Trailer                              | Description                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Constraint: <text>`                 | A hard boundary that forced or heavily shaped this decision (e.g., "must run on Cloudflare Workers, no native Node APIs").                     |
| `Rejected: <alternative> — <reason>` | An alternative that was seriously considered but rejected. Repeat the trailer for multiple alternatives.                                       |
| `Directive: <text>`                  | A forward-looking rule that this commit establishes (e.g., "all delivery attempts must be signed; unsigned delivery is not a valid fallback"). |

### Risk / Reversibility

| Trailer                                     | Description                                          |
| ------------------------------------------- | ---------------------------------------------------- |
| `Scope-risk: <low\|medium\|high>`           | Blast radius if this turns out to be wrong.          |
| `Reversibility: <easy\|hard\|irreversible>` | How painful it would be to undo this decision later. |

### Test evidence

| Trailer                     | Description                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Tested: <description>`     | What was verified before this commit landed (e.g., "integration test suite green, manual smoke on staging"). |
| `Not-tested: <description>` | Known gaps — what was NOT verified. Honest > silent.                                                         |

### Cross-references

| Trailer                      | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `Related: ADR-NNNN`          | Links to an Architecture Decision Record. Use the `docs/adrs/` number. |
| `Related: <issue or PR URL>` | Links to a GitHub issue or PR for further context.                     |

## Worked Example

```
feat(delivery): sign every delivery attempt, not just first [lore]

Previously the dispatcher only signed the originating event payload once and
forwarded the same HMAC to all retry attempts. This meant the subscriber
could not distinguish a first delivery from a retry by verifying the
signature against the attempt-specific nonce.

Constraint: Consumers must be able to verify event origin without a shared PKI.
Rejected: Payload encryption (AES-GCM) — adds key-management overhead for
  consumers who only need origin assurance, not confidentiality.
Rejected: Sign once, embed nonce in headers — nonce is not part of the signed
  payload so a MITM can replay the original signature with a swapped body.
Directive: Every delivery attempt carries an independently computed HMAC over
  (payload + attempt-id + subscription-secret); unsigned delivery is not a
  valid fallback.
Confidence: high
Scope-risk: medium
Reversibility: hard
Tested: integration suite green (apps/api-server/src/tests/integration/eventPlatform.test.ts)
Not-tested: replay-attack scenario under network partition
Related: ADR-0001
```

## Validator

The commit-msg hook in `.husky/commit-msg` calls
`ak audit commit-message --require-lore`. It verifies:

1. `Confidence:` trailer is present with a valid value
2. At least one of `Constraint:`, `Rejected:`, or `Directive:` is present

All commits must include the Lore trailers enforced by the hook.
