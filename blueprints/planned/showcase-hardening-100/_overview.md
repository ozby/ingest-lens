---
type: blueprint
status: planned
complexity: L
created: "2026-04-23"
last_updated: "2026-04-23"
progress: "Refined 2026-04-23; 0% implementation"
depends_on: []
tags:
  - showcase
  - security
  - testing
  - ci
  - contracts
  - observability
---

# Showcase hardening to 100

**Goal:** Make the existing system honest before adding branding or AI: object-level
authorization is enforced, API/client contracts agree, typecheck and CI are
real gates, dependency audit is clean, tests cover non-trivial behavior, and
metrics represent measured facts rather than fabricated demo values.

## Planning Summary

- Goal input: harden the one-year-old take-home assignment until it can survive
  principal-level interview scrutiny.
- Complexity: L because this touches authz, API contracts, CI, dependency
  hygiene, tests, and observability.
- Definition of "100%": all verification gates pass and every critical/high
  audit issue is closed or explicitly deferred with a documented non-goal.

## Architecture Overview

```text
Current state
  client API assumptions drift from Worker responses
  auth middleware proves identity but several route handlers skip ownership
  metrics tables exist but dashboard also fabricates values
  CI/test scripts allow empty suites and miss typecheck failures

Hardened state
  shared response contracts + ownership helpers
  Worker integration tests prove cross-tenant isolation and receive semantics
  client typecheck resolves shared UI exports and exercises API adapters
  CI runs install -> format/lint -> types -> tests -> build -> audit -> blueprint check
  metrics exposed only when measured or explicitly labelled synthetic in fixtures
```

## Fact-Checked Findings

| ID  | Severity | Finding                                                             | Evidence                                                                                                                                            | Blueprint fix                                                                               |
| --- | -------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F1  | Critical | Queue message routes authenticate but do not check queue ownership. | `apps/workers/src/routes/message.ts:24-39`, `93-149`, `171-195` select by queue id only.                                                            | Add `requireOwnedQueue` and use it in all message handlers. (Fx1)                           |
| F2  | Critical | Dashboard queue list leaks all queue metrics.                       | `apps/workers/src/routes/dashboard.ts:59-69` selects from `queueMetrics` without joining owned queues.                                              | Query metrics through owned queues only and lock it with worker tests. (Fx2)                |
| F3  | Critical | Topic WebSocket and subscribe flows miss ownership edges.           | `apps/workers/src/routes/topic.ts:54-60` proxies WS without topic owner check; `102-139` verifies topic owner but not queue owner.                  | Enforce owned topic and owned queue before subscription and before DO upgrade. (Fx3)        |
| F4  | High     | Client and Worker API contracts drift.                              | `api.ts:100-105` calls an absent route; `api.ts:113-117` expects `queueMetric`; Worker returns `queueMetrics`; `message.ts:168` returns raw `data`. | Add shared DTO/schema tests and fix route/client adapters from one source of truth. (Fx4)   |
| F5  | High     | Typecheck is not green.                                             | `pnpm -r check-types` fails in `apps/client` resolving `@repo/ui/components` and cascades into implicit `any`.                                      | Fix package exports/pathing and remove absolute local pack references from manifests. (Fx5) |
| F6  | High     | Production auth uses weak password hashing.                         | `apps/workers/src/middleware/auth.ts:136-158` has placeholder sync hash and SHA-256 with static `some-salt`.                                        | Use Workers-compatible PBKDF2 with per-password salt and constant-time comparison. (Fx6)    |
| F7  | High     | Tests are allowed to be empty in important workspaces.              | `apps/client/package.json` and `packages/ui/package.json` use `vitest run --passWithNoTests`.                                                       | Add behavior tests before removing `--passWithNoTests`. (Fx7)                               |
| F8  | High     | Dependency audit fails.                                             | Local audit reported critical `protobufjs` RCE and other transitive issues.                                                                         | Upgrade or override vulnerable packages without adding runtime deps. (Fx8)                  |
| F9  | Medium   | CI/tooling references stale or local-only assets.                   | Workflow calls missing `scripts/validate-blueprints.ts`, while manifests contain `file:/Users/ozby/...` packs.                                      | Switch CI to real root pnpm gates and make manifests reproducible from checkout. (Fx9)      |
| F10 | Medium   | Dashboard observability mixes real and fake values.                 | Server metrics are initialized but not incremented; client fabricates history.                                                                      | Expose measured values only, or visibly label deterministic sample fixtures. (Fx10)         |

## Key Decisions

| Decision        | Choice                                                    | Rationale                                                                                    |
| --------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Hardening first | This blueprint blocks AI and rebrand work                 | A polished demo over broken authz/typecheck harms interview signal.                          |
| Authz pattern   | Central ownership helpers (Fx1, Fx2, Fx3)                 | One helper cluster prevents repeat drift across messages, dashboard, topics, and WebSockets. |
| Contracts       | Shared DTOs + worker/client contract tests (Fx4)          | Current failure mode is response-shape drift, not missing endpoints alone.                   |
| Type safety     | Fix source-of-truth manifests before CI polish (Fx5, Fx9) | Portable package resolution must be green before any repo-wide gate is trustworthy.          |
| Passwords       | WebCrypto PBKDF2 with random salt (Fx6)                   | Workers-compatible, no new dependency, materially safer than static SHA-256.                 |
| Metrics         | Measured or clearly synthetic only (Fx10)                 | Fake production telemetry is worse than missing telemetry.                                   |

## Quick Reference (Execution Waves)

| Wave              | Tasks              | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | ------------------ | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.3, 2.1      | None         | 3 agents       | S-M              |
| **Wave 1**        | 1.2, 3.2           | Wave 0       | 2 agents       | S                |
| **Wave 2**        | 2.2, 2.3, 3.1, 3.3 | Wave 1       | 4 agents       | XS-S             |
| **Critical path** | 1.1 → 1.2 → 3.1    | —            | 3 waves        | L                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual           |
| ------ | ---------------------------------- | -------------------- | ---------------- |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 3 runnable tasks |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 9 / 3 = 3.0      |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 8 / 9 = 0.89     |
| CP     | same-file overlaps per wave        | 0                    | 0                |

**Parallelization score:** A. Same-wave file contention is fully serialized,
Wave 2 keeps four lanes busy, and the critical path stays to three waves.

---

### Phase 1: Security, contracts, and type-safety foundation [Complexity: M]

#### [security] Task 1.1: Enforce owned queue/topic access end-to-end

**Status:** todo

**Depends:** None

Create typed ownership helpers and wire them through the three Worker surfaces
that currently leak cross-tenant data. This task owns the shared authz fix for
messages, dashboard metrics, topic subscribe, and topic WebSocket upgrade. (Fx1,
Fx2, Fx3)

**Files:**

- Create: `apps/workers/src/routes/ownership.ts`
- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/routes/dashboard.ts`
- Modify: `apps/workers/src/routes/topic.ts`
- Modify: `apps/workers/src/tests/message.test.ts`
- Create: `apps/workers/src/tests/dashboard.test.ts`
- Modify: `apps/workers/src/tests/topic.test.ts`
- Modify: `apps/workers/src/tests/topicWs.test.ts`

**Steps (TDD):**

1. Add failing worker tests for user A touching user B's queue messages,
   dashboard queue list, topic subscribe route, and topic WebSocket upgrade.
2. Run: `pnpm --filter @repo/workers exec vitest run src/tests/message.test.ts src/tests/dashboard.test.ts src/tests/topic.test.ts src/tests/topicWs.test.ts` — verify FAIL.
3. Implement `requireOwnedQueue` and `requireOwnedTopic` in
   `apps/workers/src/routes/ownership.ts`, then route every message/dashboard/topic
   lookup through those helpers before business logic executes.
4. Re-run: `pnpm --filter @repo/workers exec vitest run src/tests/message.test.ts src/tests/dashboard.test.ts src/tests/topic.test.ts src/tests/topicWs.test.ts` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint && pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Cross-tenant message send, receive, get, and delete are rejected.
- [ ] Dashboard queue metrics return only owned queues.
- [ ] Topic subscribe requires both owned topic and owned queue.
- [ ] WebSocket upgrade verifies topic ownership before touching the DO stub.

---

#### [contracts] Task 1.2: Make Worker and client contracts single-source

**Status:** todo

**Depends:** Task 1.1

Serialize the shared `message.ts` and `dashboard.ts` edits after Task 1.1, then
make route payloads, `@repo/types`, and client adapters agree from one contract
source instead of duplicated assumptions. Remove stale public fields while the
contract surface is open. (Fx4)

**Files:**

- Modify: `packages/types/Entities.ts`
- Modify: `packages/types/Requests.ts`
- Modify: `packages/types/Responses.ts`
- Modify: `apps/client/src/services/api.ts`
- Create: `apps/client/src/services/api.contract.test.ts`
- Modify: `apps/workers/src/routes/dashboard.ts`
- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/tests/dashboard.test.ts`
- Modify: `apps/workers/src/tests/message.test.ts`

**Steps (TDD):**

1. Add failing worker and client contract tests for dashboard summary,
   queue-metrics payloads, and message get/receive/delete shapes in the files
   listed above.
2. Run: `pnpm --filter @repo/workers exec vitest run src/tests/dashboard.test.ts src/tests/message.test.ts` — verify FAIL.
3. Run: `pnpm --filter client exec vitest run src/services/api.contract.test.ts` — verify FAIL.
4. Normalize DTOs in `packages/types`, update Worker responses, and fix client
   adapters to consume the same response keys.
5. Re-run: `pnpm --filter @repo/workers exec vitest run src/tests/dashboard.test.ts src/tests/message.test.ts` and `pnpm --filter client exec vitest run src/services/api.contract.test.ts` — verify PASS.
6. Run: `pnpm --filter client check-types && pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] No client adapter references a Worker route that does not exist.
- [ ] Queue metrics use one agreed response key across Worker, client, and shared types.
- [ ] Message get/receive/delete payloads are contract-tested from both sides.
- [ ] Public shared types no longer expose `IUser.password` or stale expiry props.

---

#### [types] Task 1.3: Restore clean workspace typecheck and portable manifests

**Status:** todo

**Depends:** None

Fix workspace resolution on a clean checkout before repo-wide CI tightening.
This task owns the `@repo/ui/components` typecheck break and the local-only
`file:/Users/ozby/...` pack references that make installs non-reproducible.
(Fx5, Fx9)

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/client/package.json`
- Modify: `apps/client/tsconfig.json`
- Modify: `packages/ui/package.json`

**Steps (TDD):**

1. Run: `pnpm -r check-types` — capture the current client resolution failure.
2. Run: `rg -n '/Users/ozby/' package.json apps/client/package.json packages/ui/package.json` — verify the non-portable manifest references before editing.
3. Apply the minimal export/path/build-order fix and replace local file-pack
   references with reproducible sources.
4. Run: `pnpm install --lockfile-only` if the manifest change refreshes the lockfile.
5. Re-run: `pnpm -r check-types` — verify PASS.

**Acceptance:**

- [ ] `pnpm -r check-types` passes from a clean checkout.
- [ ] No root/client/ui manifest contains `file:/Users/ozby/...` references.
- [ ] The fix does not require committing generated `dist` artifacts.

### Phase 2: Runtime correctness and observability [Complexity: M]

#### [auth] Task 2.1: Replace demo password hashing with PBKDF2

**Status:** todo

**Depends:** None

Replace the placeholder hash path in Worker auth with a real Workers-compatible
KDF while keeping the implementation dependency-free and migration-aware. (Fx6)

**Files:**

- Modify: `apps/workers/src/middleware/auth.ts`
- Modify: `apps/workers/src/routes/auth.ts`
- Modify: `apps/workers/src/tests/auth.test.ts`
- Modify: `docs/adrs/0003-auth-story.md`

**Steps (TDD):**

1. Add failing auth tests for unique salts on equal passwords, successful verify,
   wrong-password rejection, and the chosen legacy-user migration boundary.
2. Run: `pnpm --filter @repo/workers exec vitest run src/tests/auth.test.ts` — verify FAIL.
3. Implement `pbkdf2$iterations$salt$hash` storage with WebCrypto PBKDF2 and a
   constant-time comparison path.
4. Re-run: `pnpm --filter @repo/workers exec vitest run src/tests/auth.test.ts` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint && pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] Static salt and placeholder hash logic are removed from the reachable auth path.
- [ ] Equal passwords store different hashes because salts differ.
- [ ] Wrong passwords fail verification with test coverage.
- [ ] ADR notes the chosen format and legacy-user handling.

---

#### [delivery] Task 2.2: Make receive visibility semantics honest

**Status:** todo

**Depends:** Task 1.2

The public API already advertises `visibilityTimeout`; this task either makes
that lease behavior real or removes the parameter in the same change. Prefer the
lease implementation, but do not leave mismatched docs or payloads behind.

**Files:**

- Modify: `apps/workers/src/db/schema.ts`
- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/tests/message.test.ts`
- Modify: `docs/delivery-guarantees.md`

**Steps (TDD):**

1. Add failing message tests for receive, invisible-during-timeout,
   visible-after-timeout, and delete/ack semantics.
2. Run: `pnpm --filter @repo/workers exec vitest run src/tests/message.test.ts` — verify FAIL.
3. Implement lease visibility semantics in the message route and schema, or
   remove the misleading API parameter and update docs in the same change.
4. Re-run: `pnpm --filter @repo/workers exec vitest run src/tests/message.test.ts` — verify PASS.
5. Run: `pnpm --filter @repo/workers check-types`.

**Acceptance:**

- [ ] `visibilityTimeout` either works as documented or is removed from the public API.
- [ ] Concurrent receive behavior is covered by tests.
- [ ] Delivery guarantees documentation matches code exactly.

---

#### [observability] Task 2.3: Make dashboard metrics measured or visibly synthetic

**Status:** todo

**Depends:** Task 1.2

Keep this independent from Task 2.2 by limiting scope to dashboard response
logic and client presentation. The dashboard may show real counters or clearly
labelled demo fixtures, but it must not imply fabricated values are production
facts. (Fx10)

**Files:**

- Modify: `apps/workers/src/routes/dashboard.ts`
- Modify: `apps/workers/src/tests/dashboard.test.ts`
- Modify: `apps/client/src/components/ServerMetrics.tsx`
- Create: `apps/client/src/components/ServerMetrics.test.tsx`
- Modify: `apps/client/src/components/Sidebar.tsx`

**Steps (TDD):**

1. Add failing worker and client tests proving owned dashboard metrics stay
   filtered and any synthetic data is explicitly labelled.
2. Run: `pnpm --filter @repo/workers exec vitest run src/tests/dashboard.test.ts` — verify FAIL.
3. Run: `pnpm --filter client exec vitest run src/components/ServerMetrics.test.tsx` — verify FAIL.
4. Remove random client-generated values from production rendering, or relabel
   deterministic fixture data before it reaches the UI.
5. Re-run: `pnpm --filter @repo/workers exec vitest run src/tests/dashboard.test.ts` and `pnpm --filter client exec vitest run src/components/ServerMetrics.test.tsx` — verify PASS.
6. Run: `pnpm --filter client check-types`.

**Acceptance:**

- [ ] Dashboard metrics stay ownership-scoped.
- [ ] No random client-generated values are presented as production telemetry.
- [ ] Synthetic/demo metrics, if retained, are visibly labelled in the UI.

### Phase 3: Test, CI, and dependency gates [Complexity: M]

#### [tests] Task 3.1: Replace empty-suite escape hatches with behavior tests

**Status:** todo

**Depends:** Task 1.2, Task 1.3

Use the contract work from Task 1.2 and the manifest fix from Task 1.3 to make
client and UI suites non-empty for real. This task only owns new behavior tests
plus script tightening; it does not reopen API contract files. (Fx7)

**Files:**

- Modify: `apps/client/package.json`
- Modify: `packages/ui/package.json`
- Create: `apps/client/src/App.test.tsx`
- Create: `packages/ui/src/components/button.test.tsx`

**Steps (TDD):**

1. Add failing tests for the client app shell/protected-route behavior and one
   shared UI primitive contract in the files listed above.
2. Run: `pnpm --filter client exec vitest run src/App.test.tsx` — verify FAIL.
3. Run: `pnpm --filter @repo/ui exec vitest run src/components/button.test.tsx` — verify FAIL.
4. Remove `--passWithNoTests` from the client and UI package scripts once those
   suites exist.
5. Re-run: `pnpm --filter client test && pnpm --filter @repo/ui test` — verify PASS.
6. Run: `pnpm --filter client lint && pnpm --filter @repo/ui lint`.

**Acceptance:**

- [ ] Client and UI test scripts fail if their suites are deleted.
- [ ] New tests cover user-visible behavior, not implementation details.
- [ ] Package test scripts no longer use `--passWithNoTests`.

---

#### [ci] Task 3.2: Make CI match clean-checkout repo gates

**Status:** todo

**Depends:** Task 1.3

Fix CI after manifest portability is restored. Keep the existing local action
path (`.github/actions/setup-monorepo/action.yml`), replace the missing blueprint
script with the real root command, and make the workflow run the same pnpm gates
reviewers use locally. (Fx9)

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/actions/setup-monorepo/action.yml`
- Modify: `package.json`

**Steps (TDD):**

1. Reproduce the current mismatch by reading `.github/workflows/ci.yml` against
   `.github/actions/setup-monorepo/action.yml` and `package.json`, confirming the
   missing `scripts/validate-blueprints.ts` reference before editing.
2. Update CI to use checkout-backed local actions, `pnpm format:check`,
   `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm build`, and
   `pnpm blueprints:check`.
3. Run: `pnpm check` — verify the consolidated repo gate still works locally.
4. Run: `pnpm blueprints:check` — verify the blueprint lifecycle command is the
   one CI should call.

**Acceptance:**

- [ ] CI does not reference missing files or scripts.
- [ ] CI uses the existing `setup-monorepo` composite action path.
- [ ] CI gate order matches local pnpm verification commands.

---

#### [deps] Task 3.3: Close audit findings and delete stale `.new` artifacts

**Status:** todo

**Depends:** Task 3.2

Keep dependency remediation and stale artifact cleanup in one infra lane after CI
commands are stable. Use minimal root-level overrides or version bumps, then
remove leftover `.new` files only after confirming the canonical files exist.
(Fx8, Fx9)

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Delete: `blueprints/README.md.new`
- Delete: `docs/templates/blueprint.md.new`
- Delete: `docs/templates/guide.md.new`
- Delete: `docs/templates/postmortem.md.new`
- Delete: `docs/templates/runbook.md.new`
- Delete: `docs/templates/system.md.new`

**Steps (TDD):**

1. Run: `pnpm audit --audit-level=moderate` — capture the current vulnerable package paths.
2. Apply minimal root-level overrides or upgrades in `package.json`, refresh
   `pnpm-lock.yaml`, and remove tracked `.new` artifacts only after verifying
   their canonical counterparts are already present.
3. Re-run: `pnpm audit --audit-level=moderate` — verify PASS, or document a
   time-boxed false-positive rationale if an upstream fix truly does not exist.
4. Run: `pnpm blueprints:check`.

**Acceptance:**

- [ ] `pnpm audit --audit-level=moderate` passes, or any residual advisory has explicit rationale and expiry.
- [ ] No tracked `.new` blueprint/docs template artifacts remain.
- [ ] Lockfile changes stay minimal and root-owned.

## Verification Gates

| Gate                | Command                             | Success Criteria                                   |
| ------------------- | ----------------------------------- | -------------------------------------------------- |
| Format              | `pnpm format:check`                 | Zero formatting violations                         |
| Lint                | `pnpm lint`                         | Zero lint violations                               |
| Type safety         | `pnpm check-types`                  | Zero TypeScript errors                             |
| Tests               | `pnpm test`                         | All suites pass without empty-suite escape hatches |
| Build               | `pnpm build`                        | All packages/apps build                            |
| Dependency audit    | `pnpm audit --audit-level=moderate` | No unresolved moderate+ vulnerabilities            |
| Blueprint lifecycle | `pnpm blueprints:check`             | All blueprint statuses and paths valid             |

## Cross-Plan References

| Type       | Blueprint                     | Relationship                                                                        |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| Downstream | `rebrand-ingestlens`          | Public rebrand should not hide critical defects.                                    |
| Downstream | `ai-payload-intake-mapper`    | AI feature depends on secure auth, stable contracts, and real CI.                   |
| Related    | `client-route-code-splitting` | Can run in parallel because this refinement keeps same-wave file conflicts at zero. |

## Edge Cases and Error Handling

| Edge Case                                                                     | Risk                                                  | Solution                                                                                            | Task          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------- |
| Guessed queue UUID hits message routes without ownership checks               | Cross-tenant data leak                                | Route all queue access through `requireOwnedQueue` and keep worker regression tests in place. (Fx1) | 1.1           |
| Dashboard queue list queries metrics without owned-queue filtering            | Cross-tenant metadata leak                            | Join/filter dashboard metrics by owned queues before response serialization. (Fx2)                  | 1.1, 2.3      |
| Topic subscribe or WebSocket upgrade checks only one side of the relationship | Unauthorized topic fan-out                            | Require both owned topic and owned queue before subscribe or DO upgrade. (Fx3)                      | 1.1           |
| Client adapters keep old response keys after Worker route fixes               | UI appears green while reading the wrong payload      | Contract-test worker responses and client adapters from the same DTO surface. (Fx4)                 | 1.2           |
| Clean checkout cannot resolve `@repo/ui/components`                           | CI typecheck fails before app logic is exercised      | Repair exports/pathing and portable manifests first. (Fx5)                                          | 1.3           |
| Same plaintext password produces the same stored hash                         | Credential reuse is easy to correlate and brute-force | Use PBKDF2 with random salt and constant-time comparison. (Fx6)                                     | 2.1           |
| Client/UI packages keep empty suites                                          | CI stays falsely green with zero behavior coverage    | Add real App/UI tests before removing `--passWithNoTests`. (Fx7)                                    | 3.1           |
| Audit remediations over-update unrelated deps                                 | Lockfile churn obscures the real security fix         | Prefer minimal root overrides or targeted upgrades only. (Fx8)                                      | 3.3           |
| CI references missing scripts or local-only file packs                        | Clean-checkout verification is non-reproducible       | Use repo-local action paths and root pnpm scripts only. (Fx9)                                       | 1.3, 3.2, 3.3 |
| Dashboard history or counters are synthesized in the client                   | Demo overstates real observability                    | Show measured values only, or visibly label deterministic sample data. (Fx10)                       | 2.3           |

## Non-goals

- No AI mapping feature in this blueprint.
- No full UI redesign or brand rewrite.
- No migration from Postgres/Hyperdrive.
- No paid SaaS adoption.

## Risks

| Risk                                                              | Impact | Mitigation                                                                                        |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Ownership guards accidentally over-block existing demo flows      | High   | Lock current route behavior with worker authz tests before changing handlers. (Fx1, Fx2, Fx3)     |
| Contract clean-up removes fields a client path still reads        | High   | Require worker + client contract tests to fail first and pass together. (Fx4)                     |
| Manifest portability fix changes install/build order unexpectedly | High   | Keep Task 1.3 minimal and validate with `pnpm -r check-types` before broader CI edits. (Fx5, Fx9) |
| PBKDF2 iteration count is too expensive for Worker CPU budget     | Medium | Benchmark in tests, choose one encoded iteration count, and document it in the ADR. (Fx6)         |
| Receive-lease semantics add subtle delivery regressions           | High   | Prefer test-first lease scenarios and update docs in the same task.                               |
| New App/UI suites become flaky because they over-mock             | Medium | Keep tests behavior-focused and dependency-light. (Fx7)                                           |
| Audit remediation masks one critical issue with a broad upgrade   | High   | Use root-level minimal overrides and review lockfile diff size. (Fx8)                             |
| CI still drifts from local practice after cleanup                 | High   | Anchor the workflow to root pnpm commands already verified locally. (Fx9)                         |

## Technology Choices

| Component            | Technology                                                              | Version                         | Why                                                                               |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| Worker authz helpers | Route-local ownership helpers in `apps/workers/src/routes/ownership.ts` | New local module                | Smallest reusable boundary for queue/topic ownership checks. (Fx1, Fx2, Fx3)      |
| Shared contracts     | `@repo/types` DTOs + worker/client Vitest contract tests                | Existing workspace package      | Catch response drift where it happens instead of duplicating interfaces. (Fx4)    |
| Type safety gate     | Root `pnpm check-types` plus portable workspace manifests               | Existing repo tooling           | CI should prove the same source checkout developers use. (Fx5, Fx9)               |
| Password KDF         | WebCrypto PBKDF2                                                        | Runtime API                     | No new deps, Workers-compatible, future-proof encoded format. (Fx6)               |
| Test harness         | Vitest with package-filtered pnpm commands                              | Existing repo tooling           | Matches current packages and supports explicit failing-test-first flow. (Fx7)     |
| Security remediation | Root `pnpm audit` + minimal overrides/upgrades                          | Existing repo tooling           | Fix vulnerable transitive packages without adding app runtime dependencies. (Fx8) |
| Metrics presentation | Measured dashboard payloads or visibly labelled fixtures                | Existing client/worker surfaces | Honest showcase metrics are more important than decorative charts. (Fx10)         |

## Refinement Summary

| Metric                    | Value                              |
| ------------------------- | ---------------------------------- |
| Findings total            | 10                                 |
| Critical                  | 3                                  |
| High                      | 5                                  |
| Medium                    | 2                                  |
| Low                       | 0                                  |
| Fixes applied             | 10/10                              |
| Cross-plans updated       | 0 (overview-only refinement scope) |
| Edge cases documented     | 10                                 |
| Risks documented          | 8                                  |
| **Parallelization score** | A                                  |
| **Critical path**         | 3 waves                            |
| **Max parallel agents**   | 4                                  |
| **Total tasks**           | 9                                  |
| **Blueprint compliant**   | 9/9                                |
