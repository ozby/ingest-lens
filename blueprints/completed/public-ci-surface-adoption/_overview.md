---
type: blueprint
title: Adopt public Webpresso CI secret surfaces
status: completed
complexity: M
created: "2026-05-23"
last_updated: "2026-05-24"
progress: "Completed 2026-05-24; IngestLens keeps presets only and delegates to wp ci act"
owner: ozby
depends_on: []
tags:
  - ci
  - secrets
  - webpresso
  - runtime
  - act
---

# Adopt public Webpresso CI secret surfaces

**Goal:** Replace the local CI secret-wrapper engine with public Webpresso CI and
secret surfaces once the upstream contract lands, while preserving current
workflow/profile behavior and keeping repo-local code limited to preset data.

## Planning Summary

- Goal input: align IngestLens with a public Webpresso CI/secret surface
  instead of mirroring internal app-script paths.
- Complexity: M because this touches local CI scripts, preset contracts,
  package scripts, and docs, but the behavioral surface is already covered by
  focused tests.
- Upstream dependency: the agent-kit blueprint
  `secret-aware-worker-tail-mcp` must first land with corrected public
  secret-gate assumptions and public `webpresso/ci-*`-style exports (or
  equivalent public helper surfaces).
- Current implementation: `scripts/act-with-webpresso.ts` contains only
  repo-owned preset mapping and delegates execution to `wp ci act` through
  `scripts/run-webpresso-cli.ts`; `scripts/act-secret-profile.ts` keeps
  explicit profile metadata.

## Product wedge anchor

IngestLens needs reliable local CI and maintenance workflow reproduction without
teaching every consumer repo to vendor secret-wrapper engines. This blueprint
keeps the current workflows working while reducing coupling to Webpresso
internals.

## Architecture Overview

```text
Before
  package scripts -> consumer-owned Doppler/temp-file/raw act wrapper engine
  local preset rules and local execution engine live in the same repo

After
  package scripts -> scripts/act-with-webpresso.ts presets -> wp ci act
  repo keeps only workflow/profile preset data and docs
  provider logic stays behind public Webpresso runtime/secret contracts
```

## Key Decisions

| Decision                | Choice                                                | Rationale                                                                  |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Secret engine ownership | Upstream public Webpresso surface                     | Consumers should not vendor CI secret-wrapper engines.                     |
| Local retained logic    | Workflow/profile preset data only                     | IngestLens-specific workflow policy is still repo-owned and testable.      |
| Provider behavior       | Public runtime secret gate only                       | Avoid direct `doppler run` / `infisical run` composition in consumer code. |
| Migration style         | Preserve CLI behavior first, then simplify local code | Existing scripts and docs are already part of contributor workflow.        |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies      | Parallelizable | Effort (T-shirt) |
| ----------------- | --------------- | ----------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1             | Upstream delivery | 1 agent        | S                |
| **Wave 1**        | 1.2, 1.3        | 1.1               | 2 agents       | S                |
| **Critical path** | 1.1 → 1.2 → 1.3 | —                 | 2 waves        | M                |

## Phase 1: Upstream-aligned consumer adoption [Complexity: M]

#### [backend] Task 1.1: Replace the local CI wrapper engine with public `webpresso/ci-*`

**Status:** done

**Depends:** None

Swap the current local execution engine over to the upstream public helper
surface. Keep any remaining local code limited to preset data or a thin adapter
that passes repo-specific workflow/profile definitions into the public API.

**Files:**

- Modify: `scripts/act-with-webpresso.ts`
- Modify: `scripts/act-secret-profile.ts`
- Modify: `package.json`

**Steps (TDD):**

1. Re-run the current focused script tests to lock behavior.
2. Introduce the public `webpresso/ci-*` surface behind the existing local
   command entrypoint — verify current behavior still passes.
3. Remove or collapse local engine logic until only preset wiring remains.
4. Run scoped verification — verify PASS.

**Acceptance:**

- [x] Consumer code no longer depends on a local CI secret-wrapper engine
- [x] No consumer code mirrors `apps/scripts/src/...` internal Webpresso paths
- [x] Package scripts still expose `act:ci`, `act:e2e`, `act:cleanup`, and `act:list`

#### [qa] Task 1.2: Preserve workflow/profile parity during the migration

**Status:** todo

**Depends:** Task 1.1

Carry forward the current workflow/profile behavior as explicit preset data and
keep it under focused regression coverage.

Current required parity:

- `.github/workflows/ci.yml` → profile `none`
- `.github/workflows/testing-e2e-act.yml` → profile `none`
- `.github/workflows/cleanup-stale-neon-e2e-branches.yml` → profile
  `neon-control-plane`
- job `cleanup` → profile `neon-control-plane`

**Files:**

- Modify: `scripts/act-secret-profile.ts`
- Modify: `scripts/act-with-webpresso.test.ts`

**Steps (TDD):**

1. Keep the current regression suite red/green during the migration.
2. Convert engine-coupled expectations into preset-contract expectations where
   appropriate.
3. Run the focused script tests — verify PASS.

**Acceptance:**

- [x] Existing workflow/profile mappings still pass under the new public surface
- [x] Allowed keys, required keys, and default sources remain explicit and tested
- [x] The focused script test suite remains green

#### [docs] Task 1.3: Update scripts and docs to the public Webpresso surface

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Update contributor-facing scripts and documentation so they describe the public
Webpresso CI/secret surface rather than the local wrapper engine.

**Files:**

- Modify: `README.md`
- Modify: `docs/secrets/doppler.md`
- Modify: `apps/e2e/README.md`
- Modify: `package.json`

**Steps (TDD):**

1. Update command examples and explanations to the new public path.
2. Remove or demote docs that present the local engine as the primary contract.
3. Run docs/frontmatter verification — verify PASS.

**Acceptance:**

- [x] Contributor docs describe the public Webpresso CI/secret surface
- [x] Docs no longer imply that local CI behavior depends on a bespoke local engine
- [x] Docs/frontmatter verification passes

## Verification Gates

| Gate                | Command                                                                                                  | Success Criteria |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| Focused tests       | `bun test scripts/act-with-webpresso.test.ts scripts/private-package-proof.test.js`                                                              | All pass         |
| Docs/frontmatter    | `AK_SKIP_UPDATE_CHECK=1 bun ./scripts/run-webpresso-cli.ts agent audit docs-frontmatter`                 | Pass             |
| Blueprint lifecycle | `AK_SKIP_UPDATE_CHECK=1 bun ./scripts/run-webpresso-cli.ts agent audit blueprint-lifecycle --legacy-omx` | Pass             |

## Cross-Plan References

| Type       | Blueprint                                                                                            | Relationship                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Upstream   | `/Users/ozby/repos/webpresso/agent-kit/blueprints/planned/secret-aware-worker-tail-mcp/_overview.md` | Must land first with corrected public secret-gate assumptions and public CI helper surfaces |
| Downstream | None                                                                                                 |                                                                                             |

## Edge Cases and Error Handling

| Edge Case                                           | Risk                                            | Solution                                                                                            | Task |
| --------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---- |
| Upstream ships a different public subpath name      | Migration stalls on naming drift                | Keep this blueprint pinned to behavior, not hardcoded package names, until upstream naming is final | 1.1  |
| Local CI workflows intentionally inject no secrets  | Migration accidentally broadens secret exposure | Preserve the current `none` profile mapping and tests                                               | 1.2  |
| Control-plane workflow loses required secret checks | Cleanup automation breaks late                  | Keep `requiredKeys` parity tests in place                                                           | 1.2  |

## Non-goals

- Replacing the current workflow files themselves
- Redesigning the repo's CI workflows
- Introducing provider-specific shell wrappers in consumer code

## Risks

| Risk                                                                | Impact | Mitigation                                                 |
| ------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Upstream public surface lands with extra consumer-local assumptions | Medium | Validate the contract before starting Task 1.1             |
| Docs drift during migration                                         | Low    | Keep docs changes in the same wave as the script migration |

## Technology Choices

| Component            | Technology                                       | Version                   | Why                                                   |
| -------------------- | ------------------------------------------------ | ------------------------- | ----------------------------------------------------- |
| Secret gate          | `@webpresso/runtime` public surface              | current workspace version | Provider-agnostic execution should stay upstream      |
| CI helper surface    | `webpresso/ci-*` public subpaths (or equivalent) | upstream-delivered        | Matches existing Webpresso public export patterns     |
| Local policy surface | Repo-owned preset data                           | current repo code         | Keeps IngestLens-specific workflow semantics explicit |
