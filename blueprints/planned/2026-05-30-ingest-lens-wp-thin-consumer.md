---
type: blueprint
status: planned
complexity: M
created: '2026-05-30'
last_updated: '2026-05-30'
progress: '0% (drafted)'
depends_on:
  - /Users/ozby/repos/webpresso/agent-kit/blueprints/planned/2026-05-30-cross-project-wp-execution-map.md
  - /Users/ozby/repos/webpresso/agent-kit/blueprints/planned/2026-05-30-agent-kit-base-wp-core.md
tags:
  - wp
  - ingest-lens
  - thin-consumer
  - tooling
---

# IngestLens: `wp`-first thin-consumer migration

**Goal:** Make `ingest-lens` a `wp`-first thin consumer of `@webpresso/agent-kit`
by removing active public raw `pnpm`, direct `vitest`, and bare `tsc` from
normal workflows and shrinking duplicated generic tooling after wrapper adoption
is proven.

## Planning Summary

- Goal input: `IngestLens thin-consumer wp-first migration`
- Complexity: `M`
- Draft slug: `2026-05-30-ingest-lens-wp-thin-consumer`
- Output path: `blueprints/planned/2026-05-30-ingest-lens-wp-thin-consumer.md`
- Validation scope: parser compliance + architecture-governance consistency

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../docs/architecture.contract.json)

## Architecture Overview

```text
developer/CI
  -> wp install/setup/test/typecheck/lint/format --check
  -> agent-kit-owned generic workflows
  -> ingest-lens keeps only app/runtime/deploy-specific behavior
```

## Architecture before

The repo still carries duplicated generic tooling and public command surfaces
that expose raw `pnpm`, direct `vitest`, and bare `tsc` in places where the
intent is generic developer workflow rather than app-specific runtime behavior.

## Architecture after

The repo uses `wp` as the normal human/CI entrypoint for generic workflows and
keeps only app/runtime/deploy-specific behavior outside the shared `agent-kit`
surface. Generic tooling duplication is reduced after the wrapper surface is
proven stable.

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Consumer class | thin consumer | IngestLens should not absorb framework-specific command behavior |
| Generic workflow owner | `agent-kit` | Shared dev/test/typecheck/lint flows belong upstream |
| De-dup timing | after wrapper verification | avoid breaking strict package execution prematurely |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1 | None | 1 agent | S |
| **Wave 1** | 1.2, 1.3 | Task 1.1 | 2 agents | S |
| **Wave 2** | 2.1 | Wave 1 | 1 agent | S |
| **Critical path** | 1.1 → 1.2 → 2.1 | -- | 3 waves | M |

### Phase 1: public-surface migration [Complexity: M]

#### [cli] Task 1.1: Replace active public raw `pnpm`, direct `vitest`, and bare `tsc`

**Status:** todo

**Depends:** None

Update active scripts, docs, and workflows so generic developer flows route
through `wp`. Preserve only truly structural or intentionally low-level
substrate references.

**Files:**

- Modify: `package.json`
- Modify: `apps/**/package.json`
- Modify: `packages/**/package.json`
- Modify: `docs/**`
- Modify: `README.md`

**Steps (TDD):**

1. Add or update command-surface tests/audits for public raw `pnpm` / direct tool leakage.
2. Run scoped checks — verify FAIL.
3. Update the public surfaces to `wp`-first usage.
4. Run scoped checks — verify PASS.

**Acceptance:**

- [ ] Active public generic workflows are `wp`-first.
- [ ] Remaining raw `pnpm` references are substrate or intentional exceptions only.

#### [config] Task 1.2: Standardize normal flows on `wp install/setup/test/typecheck/lint/format --check`

**Status:** todo

**Depends:** Task 1.1

Align the repo’s expected daily command set on the base `wp` contract so local
docs, scripts, and CI all reinforce the same thin-consumer surface.

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/**`
- Modify: `docs/**`

**Steps (TDD):**

1. Add or update verification that the intended commands appear in active guidance.
2. Run scoped checks — verify FAIL.
3. Update the command set and supporting docs.
4. Run scoped checks — verify PASS.

**Acceptance:**

- [ ] Normal user/CI flows align on the same `wp` command set.
- [ ] Generic upstream behavior is not reimplemented locally.

#### [deps] Task 1.3: Remove duplicated generic tooling after wrapper checks pass

**Status:** todo

**Depends:** Task 1.1

Only after wrapper-based checks pass, remove duplicated generic tooling that is
no longer needed for public workflow ownership.

**Files:**

- Modify: `package.json`
- Modify: `apps/**/package.json`
- Modify: `packages/**/package.json`

**Steps (TDD):**

1. Add or refresh package-ownership checks for required local deps.
2. Remove duplicated generic tooling incrementally.
3. Run scoped checks — verify PASS.

**Acceptance:**

- [ ] Generic tooling duplication is reduced safely.
- [ ] App/runtime/deploy-specific dependencies remain intact.

### Phase 2: consumer proof [Complexity: S]

#### [qa] Task 2.1: Add or refresh thin-consumer contract checks

**Status:** todo

**Depends:** Task 1.2, Task 1.3

Pin the intended thin-consumer surface with smoke checks and leakage audits so
future changes do not reintroduce public raw `pnpm`, direct `vitest`, or bare
`tsc`.

**Files:**

- Modify: `apps/e2e/**`
- Modify: `**/test*.ts`

**Steps (TDD):**

1. Add failing contract checks for `wp install/setup/typecheck/test/lint/format --check`.
2. Run scoped checks — verify FAIL.
3. Implement the smallest verification updates.
4. Run scoped checks — verify PASS.

**Acceptance:**

- [ ] Thin-consumer contract checks pin the intended command surface.
- [ ] Public direct-tool leakage is part of verification.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | repo typecheck recipe | Zero errors |
| Lint | repo lint recipe | Zero violations |
| Tests | repo test recipe | Targeted suites pass |
| Architecture drift | `python3 scripts/check_architecture_drift.py` or `wp audit architecture-drift --root .` | No drift on touched docs/contracts |

## Cross-Plan References

| Type | Blueprint | Relationship |
| ---- | --------- | ------------ |
| Upstream | `2026-05-30-cross-project-wp-execution-map` | umbrella execution order |
| Upstream | `2026-05-30-agent-kit-base-wp-core` | base `wp` command contract |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Wrapper migration breaks a strict package-local execution path | broken dev flow | de-dup only after wrapper checks pass | 1.3 |
| Docs and scripts drift apart | mixed public guidance | pin intended commands in contract checks | 1.2, 2.1 |

## Non-goals

- Adopting framework-specific command behavior
- Removing app/runtime/deploy-specific dependencies just because they are local

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Tooling cleanup starts before wrapper ownership is stable | High | keep de-dup downstream of wrapper verification |
| Architecture docs drift while command surfaces change | Medium | include drift checks in verification gates |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Generic workflow owner | `@webpresso/agent-kit` | workspace consumer | Upstream `wp` surface |
| Local substrate | `pnpm` | repo-declared | Structural workspace dependency only |
