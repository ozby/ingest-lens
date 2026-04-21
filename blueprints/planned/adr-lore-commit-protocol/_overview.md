---
type: blueprint
status: planned
complexity: S
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on: []
tags:
  - adr
  - docs
  - commit-hygiene
  - lore
---

# ADR system + Lore Commit Protocol

**Goal:** Capture durable architecture decisions in a lightweight ADR format
and make every non-trivial commit carry a structured trailer block ("Lore
Commit Protocol") that encodes constraint, alternative, confidence,
reversibility, and test evidence.

## Planning Summary

- **Why:** A 25-year codebase is only as good as its institutional memory. ADRs capture _why_ something was chosen; Lore trailers capture _how sure_ the author was and _what was rejected_. Both survive team turnover.
- **Scope:** Add an `docs/adrs/` directory with a template, the first 3 retrospective ADRs (current event-delivery architecture, pubsub model, auth story), and a git `commit-msg` hook that enforces the Lore trailer on commits marked `[lore]`.

## Architecture Overview

```text
docs/adrs/
  README.md
  TEMPLATE.md
  0001-event-delivery-signing-model.md
  0002-pubsub-in-process-vs-durable.md
  0003-auth-story.md

.husky/commit-msg
  - validates conventional-commit subject
  - if subject contains "[lore]", validates the Lore trailer block

docs/conventions/lore-commit-protocol.md
  - full trailer vocabulary (from reference repo): Constraint / Rejected / Confidence /
    Scope-risk / Reversibility / Directive / Tested / Not-tested / Related
```

## Fact-Checked Findings

| ID  | Severity | Claim                             | Reality                                                                                               | Fix                                                             |
| --- | -------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| F1  | MEDIUM   | Every commit needs a Lore trailer | No — only commits that introduce or reverse a _decision_ do. The `[lore]` marker opt-in avoids noise. | Opt-in via subject tag; validator only fires on tagged commits. |
| F2  | LOW      | ADRs replace blueprints           | No. ADRs record _decisions_; blueprints track _execution_. Both coexist.                              | Document the distinction in `docs/adrs/README.md`.              |

## Evidence Base

- `[reference repo]` → "Lore Commit Protocol > Trailer Vocabulary" section.
- Decision records methodology: Michael Nygard ADR format.

## Task Pool

### Phase 1: Scaffold [Complexity: S]

#### [docs] Task 1.1: ADR directory + template

**Status:** pending **Depends:** None

**Files:**

- Create: `docs/adrs/README.md`
- Create: `docs/adrs/TEMPLATE.md`

**Acceptance:**

- [ ] Template includes `Status`, `Context`, `Decision`, `Consequences`, `Alternatives`.

#### [docs] Task 1.2: Lore trailer spec

**Status:** pending **Depends:** None

**Files:**

- Create: `docs/conventions/lore-commit-protocol.md`

**Acceptance:**

- [ ] Document lists every trailer and when to use it.
- [ ] Includes one worked example.

### Phase 2: Retrospective ADRs [Complexity: S]

#### [docs] Task 2.1: Write ADRs 0001–0003

**Status:** pending **Depends:** Task 1.1

**Files:**

- Create: `docs/adrs/0001-event-delivery-signing-model.md`
- Create: `docs/adrs/0002-pubsub-in-process-vs-durable.md`
- Create: `docs/adrs/0003-auth-story.md`

**Acceptance:**

- [ ] Each ADR follows the template and cites at least one repo file.

### Phase 3: Enforcement [Complexity: S]

#### [dx] Task 3.1: commit-msg validator for `[lore]` commits

**Status:** pending **Depends:** Task 1.2 **Blocked:** commit-hooks-guardrails commit-msg hook exists.

**Files:**

- Create: `scripts/validate-lore-trailer.ts`
- Modify: `.husky/commit-msg`

**Acceptance:**

- [ ] A commit whose subject includes `[lore]` must contain a `Confidence:` trailer and at least one of `Constraint:` / `Rejected:` / `Directive:`.
- [ ] Non-`[lore]` commits are unaffected.

## Verification Gates

| Gate    | Command                                                 | Success                       |
| ------- | ------------------------------------------------------- | ----------------------------- |
| Format  | `pnpm exec prettier --check docs/adrs docs/conventions` | Clean                         |
| Trailer | `scripts/validate-lore-trailer.ts <commit-msg-file>`    | Exit 0 on valid, 1 on invalid |

## Cross-Plan References

| Type    | Blueprint                     | Relationship                      |
| ------- | ----------------------------- | --------------------------------- |
| Related | `commit-hooks-guardrails`     | commit-msg hook owner             |
| Related | `agents-md-principal-rewrite` | Communication surface points here |

## Non-goals

- Enforcing ADRs retroactively on every historical decision.
- Requiring every commit to be `[lore]`.

## Risks

| Risk                                        | Impact | Mitigation                                                                |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| Trailer fatigue if enforced on every commit | High   | Opt-in via `[lore]` subject tag                                           |
| ADRs rot because nobody reads them          | Medium | Blueprints reference relevant ADRs; PR template asks "which ADR applies?" |

## Refinement Summary (2026-04-22 pass)

Findings:

- **Partial execution:** `docs/templates/adr.md` already exists (authored in the docs-taxonomy import). Task 1.1 now only needs `docs/adrs/README.md` — the template exists.
- **Partial execution:** `[lore]`-trailer validation already lives in `scripts/check-commit-msg.ts` and fires on `[lore]`-tagged commits. Task 3.1 is **substantially landed**; what remains is the standalone `scripts/validate-lore-trailer.ts` referenced in the blueprint — but the logic is inline in `check-commit-msg.ts`. Recommend closing Task 3.1 as "merged into check-commit-msg" or refactor-out-to-its-own-script.
- Three retrospective ADRs (0001–0003) are the real work here.

Fixes applied:

- Flagged Task 1.1 as template-already-exists.
- Flagged Task 3.1 as largely-landed (see `scripts/check-commit-msg.ts:59-65`).

**Blueprint compliant: Yes.** Lower effort than originally scoped.
