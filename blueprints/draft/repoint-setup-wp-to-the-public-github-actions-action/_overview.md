---
type: blueprint
title: Repoint setup-wp to the public github-actions action
status: draft
complexity: S
owner: claude
created: "2026-07-15"
last_updated: "2026-07-15"
progress: "0% (drafted; implementation verified manually, pending formal task-verify)"
depends_on: []
tags: [ci, agent-kit]
---

# Repoint setup-wp to the public github-actions action

**Goal:** Repoint this repo's `ci.yml`, `e2e.yml`, `e2e-act.yml`,
`security-scan.yml`, and `cleanup-stale-neon-e2e-branches.yml` setup-wp action
references from the private `webpresso/agent-kit` repo to the new public
`webpresso/github-actions/.github/actions/setup-wp` action, since GitHub
cannot grant private-repo Actions access to callers outside the `webpresso`
GitHub org.

## Product wedge anchor

- **Stage outcome:** This repo is a live, shipped Cloudflare Workers product
  (per this workspace's cross-repo docs, the primary reference consumer of
  the webpresso framework/agent-kit tooling). Every CI run currently fails at
  "Set up job" with `Unable to resolve action 'webpresso/agent-kit', not
found`, because that action lives in a private repo this repo's GitHub org
  cannot access.
- **Consuming surface:** This repo's own `.github/workflows/*.yml` — every PR
  to this repo, regardless of what it changes.
- **New user-visible capability:** Every future PR to this repo can pass CI
  again — currently every PR is red regardless of the actual code change,
  blocking all shipping.

## Key Decisions

| Decision                                | Choice                                                                                                                                                                                                                                                                   | Rationale                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where to source `wp` install            | Public `webpresso/github-actions/.github/actions/setup-wp` action                                                                                                                                                                                                        | GitHub cannot grant this repo's org access to the private `webpresso/agent-kit` repo's Actions                                                                |
| Version resolution                      | Reintroduce a `Resolve wp version` step reading `WP_SETUP_AGENT_KIT_VERSION` with a `2.3.2` default, feeding the new action's required `version` input                                                                                                                   | Preserves this repo's pre-regression override semantics; the regression had silently dropped version control entirely (bare `uses:` with no version anywhere) |
| `scripts/check-workflow-action-pins.ts` | Removed the check that rejected any `setup-wp` `with: version:` input; updated the `AGENT_KIT_VERSION`/`WP_SETUP_AGENT_KIT_VERSION` rule to forbid only a top-level env declaration, not the legitimate `${WP_SETUP_AGENT_KIT_VERSION:-2.3.2}` shell-expansion reference | The old private action was self-versioning; the new one requires an explicit version, so the old rejection rule is now backwards                              |
| `test/ci-workflow-contract.test.ts`     | Updated 3 regex assertions from the old private path to the new public path; relaxed the blanket `WP_SETUP_AGENT_KIT_VERSION` ban to a top-level-declaration-only ban                                                                                                    | Hardcoded assumptions from the same regression; would have failed against this fix otherwise                                                                  |

#### Task 1.1: Repoint all 6 setup-wp occurrences and fix governance assumptions

**Status:** todo

**Depends:** None

Swap all 6 `uses:` occurrences across the 5 workflow files from
`webpresso/agent-kit/.github/actions/setup-wp@e02badc2ba922b2d8cbfe7f3f35fb9cf56848182`
to `webpresso/github-actions/.github/actions/setup-wp@c2c71a7a4be446fc6858e6b57bf55a11ccfa2d88`
(the merge commit of `webpresso/github-actions#23`), each preceded by a new
"Resolve wp version" step and passing `with: version:` from its output.
Also fix the two governance scripts/tests found (during verification) to
hardcode the old, now-broken assumptions.

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/e2e.yml`
- Modify: `.github/workflows/e2e-act.yml`
- Modify: `.github/workflows/security-scan.yml`
- Modify: `.github/workflows/cleanup-stale-neon-e2e-branches.yml`
- Modify: `scripts/check-workflow-action-pins.ts`
- Modify: `test/ci-workflow-contract.test.ts`

**Acceptance:**

- [ ] All 6 `uses:` occurrences point at the new public action's SHA (verified manually; not yet run through formal task-verify flow)
- [ ] Each has a `Resolve wp version` step preserving `WP_SETUP_AGENT_KIT_VERSION` override semantics (verified manually)
- [ ] `actionlint` (touched files) exits 0 (verified manually — passed)
- [ ] `node scripts/check-workflow-action-pins.ts` exits 0 (verified manually — passed)
- [ ] `node --test test/ci-workflow-contract.test.ts`: 6/6 pass (verified manually — passed)
- [ ] `@repo/e2e` package tests: 26/28 pass, matching pre-existing baseline (verified manually — passed)

---

## Verification Gates

| Gate           | Command                                         | Success Criteria                           |
| -------------- | ----------------------------------------------- | ------------------------------------------ |
| Action lint    | `actionlint` (5 touched workflow files)         | Exit 0                                     |
| Pin governance | `node scripts/check-workflow-action-pins.ts`    | Exit 0                                     |
| Contract test  | `node --test test/ci-workflow-contract.test.ts` | 6/6 pass                                   |
| E2E package    | `wp_test` (package `@repo/e2e`)                 | 26/28 pass, matching pre-existing baseline |

## Cross-Plan References

| Type       | Blueprint                                                                                                                                 | Relationship                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Upstream   | `webpresso/github-actions#23` (adds the public `setup-wp` action)                                                                         | blocking dependency, merged first |
| Downstream | Sibling fixes in `webpresso/framework`, `ozby/edge-matte`, `ozby/aksaprocess.tr`, and `webpresso/github-actions`'s own reusable workflows | parallel, independent PRs         |

## Non-goals

- Does not add a repo-local `@webpresso/agent-kit` package dependency (forbidden by `apps/e2e/src/global-wp-contract.test.ts`, left untouched).
- Does not change `@webpresso/agent-config` usage.
- Does not fix the 2 pre-existing `global-wp-contract.test.ts` failures — confirmed identical on `origin/main`, out of scope for this fix.

## Risks

| Risk                                                                      | Impact                | Mitigation                                                                               |
| ------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| Governance scripts encoding the old design could resurface in other repos | Same CI break repeats | Same fix pattern applied to sibling repos in this migration; each verified independently |
