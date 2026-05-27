---
type: blueprint
title: Adopt the finalized public Webpresso CI secret surfaces
status: planned
complexity: M
created: "2026-05-23"
last_updated: "2026-05-26"
progress: "0/3 tasks done (0%) - refreshed to match the current act-with-webpresso baseline on 2026-05-26"
owner: ozby
depends_on: []
cross_repo_depends_on:
  - repo: webpresso/agent-kit
    slug: secret-aware-worker-tail-mcp
    require_status: planned
tags:
  - ci
  - secrets
  - webpresso
  - runtime
  - act
---

# Adopt the finalized public Webpresso CI secret surfaces

## Product wedge anchor

Ingest-lens already moved its active local secret surface onto `with-secrets`
and `act-with-webpresso`, but the planned blueprint still describes the older
Doppler wrapper shape. This blueprint now tracks the real remaining consumer
work: converge on the finalized public helper/export contract and keep repo
policy limited to preset data and docs.

## Architecture governance

Architecture docs:

- [`docs/architecture.md`](../../../docs/architecture.md)
- [`docs/architecture.contract.json`](../../../docs/architecture.contract.json)

## Planning Summary

Verified on 2026-05-26:

- `package.json` routes `act:ci`, `act:e2e`, `act:cleanup`, and `act:list`
  through `scripts/act-with-webpresso.ts`.
- the local test file is `scripts/act-with-webpresso.test.ts`.
- the repo already uses `with-secrets -- vp run dev`.
- `scripts/audit-secret-provider-quarantine.ts` already guards against raw
  provider-specific secret usage in active surfaces.

The remaining work is not “replace a local Doppler engine from scratch”; it is
to finish consumer adoption onto the finalized public helper/export contract and
align contributor guidance with the real `wp_*` and secret setup surface.

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies              | Parallelizable | Effort (T-shirt) |
| ----------------- | --------- | ------------------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2  | Agent-kit child delivered | 2 agents       | XS-S             |
| **Wave 1**        | 1.3       | 1.1, 1.2                  | 1 agent        | S                |
| **Critical path** | 1.1 → 1.3 | —                         | 2 waves        | M                |

#### Task 1.1: [backend] Collapse the local act wrapper to finalized preset-only ownership

**Status:** blocked

**Depends:** None

**Blocked:** Wait for the upstream public helper/export contract to settle in
`agent-kit`.

Keep workflow/profile policy local, but remove any remaining duplicated act
mechanics once the finalized public helper/export surface is ready.

**Files:**

- Modify: `scripts/act-with-webpresso.ts`
- Modify: `scripts/act-with-webpresso.test.ts`
- Modify: `scripts/act-secret-profile.ts`

**Steps (TDD):**

1. Re-run the current focused tests to lock the `act-with-webpresso` baseline.
2. Add failing expectations for the finalized public helper/export contract.
3. Update the wrapper so local code owns only preset/profile policy.
4. Re-run: `vp run test -- scripts/act-with-webpresso.test.ts` — verify PASS.
5. Run: `vp run typecheck`.

**Acceptance:**

- [ ] Local CI code owns preset/profile policy, not duplicated helper mechanics
- [ ] `scripts/act-with-webpresso.test.ts` stays green
- [ ] `vp run typecheck` passes

#### Task 1.2: [qa] Preserve workflow/profile parity while the helper contract changes

**Status:** blocked

**Depends:** Task 1.1

**Blocked:** Wait for Task 1.1.

Carry forward the current workflow/profile behavior as explicit preset-contract
tests while the underlying public helper/export contract changes.

**Files:**

- Modify: `scripts/act-secret-profile.ts`
- Modify: `scripts/act-with-webpresso.test.ts`

**Steps (TDD):**

1. Add focused failing assertions for `none`, `github-api`, and
   `neon-control-plane` profile parity under the finalized helper contract.
2. Run: `vp run test -- scripts/act-with-webpresso.test.ts` — verify FAIL.
3. Update the preset contract or wrapper wiring as needed.
4. Re-run the focused tests — verify PASS.
5. Run: `vp run lint`.

**Acceptance:**

- [ ] Existing workflow/job mappings remain explicit and tested
- [ ] Least-privilege secret expectations remain intact
- [ ] Focused tests and lint pass

#### Task 1.3: [docs] Align contributor guidance with `wp_*`, `wp config secrets setup`, and `with-secrets`

**Status:** blocked

**Depends:** Task 1.1, Task 1.2

**Blocked:** Wait for Tasks 1.1 and 1.2.

Refresh repo guidance so contributors see the real current contract: `wp_*`
tool names, `wp config secrets setup`, `with-secrets -- <cmd>`, and
`act-with-webpresso` rather than stale `ak_*` or Doppler-first wording.

**Files:**

- Modify: `README.md`
- Modify: `docs/secrets/doppler.md`
- Modify: `CLAUDE.md`

**Steps (TDD):**

1. Add or update checks that fail on stale `act-with-doppler` or `ak_*`
   guidance in active docs.
2. Run the focused docs checks — verify FAIL.
3. Update docs and tool-routing guidance to the finalized public surface.
4. Re-run the focused docs checks — verify PASS.
5. Run: `WP_SKIP_UPDATE_CHECK=1 wp audit docs-frontmatter` and
   `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle --legacy-omx`.

**Acceptance:**

- [ ] Active repo guidance uses `wp_*` rather than stale `ak_*` names
- [ ] Secret setup guidance points at `wp config secrets setup`
- [ ] Docs and blueprint audits pass

## Verification Gates

| Gate                | Command                                                            | Success Criteria |
| ------------------- | ------------------------------------------------------------------ | ---------------- |
| Focused tests       | `vp run test -- scripts/act-with-webpresso.test.ts`                | All pass         |
| Docs/frontmatter    | `WP_SKIP_UPDATE_CHECK=1 wp audit docs-frontmatter`                 | Pass             |
| Blueprint lifecycle | `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle --legacy-omx` | Pass             |

## Cross-Plan References

| Type                | Blueprint                                                                                                                                                                                      | Relationship                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Upstream            | [`webpresso/agent-kit: secret-aware-worker-tail-mcp`](https://github.com/webpresso/agent-kit/blob/main/blueprints/planned/secret-aware-worker-tail-mcp/_overview.md)                           | Stabilizes the public helper/export surface this repo consumes.           |
| Documentary roadmap | [`webpresso/agent-kit: mcp-first-secret-surface-hard-cut-roadmap`](https://github.com/webpresso/agent-kit/blob/main/blueprints/planned/mcp-first-secret-surface-hard-cut-roadmap/_overview.md) | Tracks this repo as a downstream adoption lane.                           |
| Sibling             | [`webpresso/monorepo: secret-aware-ci-act-helper-adoption`](https://github.com/webpresso/monorepo/blob/main/webpresso/blueprints/planned/secret-aware-ci-act-helper-adoption/_overview.md)     | First-party adopter converging on the same public helper/export contract. |

## Risks and edge cases

| Edge case                                                            | Risk   | Mitigation                                                                      |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Upstream helper/export cleanup changes wrapper assumptions.          | HIGH   | Keep focused `act-with-webpresso` regression tests green through the migration. |
| Repo guidance keeps advertising stale `ak_*` or Doppler-first flows. | MEDIUM | Treat docs/tool-routing cleanup as a dedicated final task with audits.          |
