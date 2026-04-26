---
type: blueprint
status: completed
complexity: M
created: "2026-04-26"
last_updated: "2026-04-26"
progress: "100% (4/4 tasks done, 0 blocked, updated 2026-04-26)"
depends_on:
  - cf-queues-delivery
tags:
  - cloudflare-workers
  - queues
  - reliability
  - delivery
  - tech-debt
  - correctness
completed_at: "2026-04-26"
---

# Delivery consumer correctness

**Goal:** Close two at-least-once-delivery correctness bugs in
`apps/workers/src/consumers/deliveryConsumer.ts` and reconcile the
README's "DLQ behavior" claim with the code. Together these make the
README's "honest delivery semantics" claim actually true.

## Planning Summary

- **Why now:** Real bugs in shipped code that contradict documented delivery
  guarantees. Spotted during interview-exercise scoping (2026-04-26).
- **Scope (this blueprint):** B1 (`msg.attempts` for backoff) and B2
  (4xx/5xx classification → DLQ). Both are consumer-only; producer side
  is touched only to keep `attempt` field optional during the rollout window.
- **Deferred to sibling blueprints:**
  - **`topicroom-dedupe-then-notify-before-ack`** (follow-on for B3):
    add UNIQUE on `msg_log.messageId`, dedupe `handlePostNotify`, then reorder
    ack/notify. Cannot be safely shipped before TopicRoom dedupes.
- **Infra precondition resolved:** Pulumi `delivery-dlq` resource was provisioned in
  `infra/src/resources/exports-queues.ts` via commit `ab0eeb1` (same wave); no separate
  `infra-delivery-dlq` blueprint was required.
- **Out of scope:** Producer crash window, exactly-once delivery, DLQ inspection
  UI, removal of `attempt` field from `DeliveryPayload` (deferred follow-up
  release), B3 reorder.

## Pre-execution audit

**Readiness:** All tasks unblocked. DLQ resource provisioned via `ab0eeb1`.

**Verified (2026-04-26)**

- `deliveryConsumer.ts` exists, 90 LoC; reads `msg.body.attempt` (always `0`).
- `routes/topic.ts:98` also stamps `attempt: 0` (both producers checked).
- `wrangler.toml` declares `max_retries = 5` and `dead_letter_queue = "delivery-dlq-{dev,prd}"`.
- `@cloudflare/workers-types@4.20260423.1` declares `readonly attempts: number` on `Message<Body>` at index.d.ts:2367.
- `docs/delivery-guarantees.md` exists and is clean.
- Pulumi `delivery-dlq` resource provisioned in `infra/src/resources/exports-queues.ts` (commit `ab0eeb1`) — precondition for Tasks 1.3 + 1.4 satisfied; no `infra-delivery-dlq` sibling blueprint required.

## Bugs

| ID  | File:line                                                   | Bug                                                                          | Scope                                                                                            |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| B1  | `deliveryConsumer.ts:15,79,85`; `routes/{message,topic}.ts` | Reads `msg.body.attempt` (always `0`); backoff index resets on every restart | **In scope** — consumer-side fix; field stays optional (R10 deploy safety)                       |
| B2  | `deliveryConsumer.ts:78-82`                                 | Any non-2xx retries with same backoff; permanent 401/410 burns retry budget  | **In scope** — permanents route to DLQ with `failure_class` attribute                            |
| B3  | `deliveryConsumer.ts:44,46-77`                              | `msg.ack()` before `TOPIC_ROOMS` notify; notify throw → silent drop          | **DEFERRED** — TopicRoom doesn't dedupe by `messageId`; reorder alone causes duplicate broadcast |
| B4  | README "Delivery rails"                                     | Claims DLQ behavior; consumer never routes to DLQ                            | **Shipped** (Task 1.4) — README + `delivery-guarantees.md` updated                               |

## Architecture changes (B1 + B2 only)

```text
before:
  → !2xx? retry({ delaySeconds: backoff[body.attempt] })   // always 0 → always 5s
  → throw? retry({ delaySeconds: backoff[body.attempt] })

after:
  → if 4xx (excl. 408/425/429): permanent
      msg.retry({ delaySeconds: 0 })   // collapses to DLQ via max_retries=5
      telemetry: { status: "permanent", failure_class: "permanent" }
  → if 5xx / 408 / 425 / 429 / throw: transient
      msg.retry({ delaySeconds: backoff[Math.min(msg.attempts - 1, len-1)] })

DeliveryPayload during rollout:
  { messageId, seq, queueId, pushEndpoint, topicId, attempt?: number }
  // optional; ignored by new consumer; removed in follow-up release
```

## Key Decisions

| Decision          | Choice                                  | Rationale                                                                                     |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Attempt source    | `msg.attempts` platform metadata        | No schema change; survives consumer restart by construction                                   |
| Field removal     | Defer; keep `attempt?: number` optional | Deploy boundary safety: old consumer on `attempt`-less body → `BACKOFF[NaN]` → poisoned queue |
| 4xx/5xx split     | Permanent on 4xx except 408/425/429     | RFC + AWS SDK precedent; 410-Gone fails fast                                                  |
| Permanent routing | Route to DLQ with `failure_class`       | Single ops console; analytics-tag-only approach has zero tooling (DLQ UI out of scope)        |
| B3 reorder        | Deferred                                | TopicRoom `handlePostNotify` has no UNIQUE on `messageId`; reorder → duplicate WS broadcast   |
| Mutation gate     | Removed                                 | `test:mutation` script doesn't exist; gate would block on cosmetic mutants                    |

## Quick Reference (Execution Waves)

Serial blueprint — all code-touching tasks modify `deliveryConsumer.ts`.

| Wave              | Tasks                 | Dependencies | Done? | Effort |
| ----------------- | --------------------- | ------------ | ----- | ------ |
| Wave 0            | 1.1 regression tests  | None         | Yes   | S      |
| Wave 1            | 1.2 B1 fix            | 1.1          | Yes   | S      |
| Wave 2            | 1.3 B2 + DLQ routing  | 1.2          | Yes   | S      |
| Wave 3            | 1.4 README + docs     | 1.3          | Yes   | XS     |
| **Critical path** | 1.1 → 1.2 → 1.3 → 1.4 | —            | —     | M      |

---

### Phase 1: Bug fixes + DLQ reconciliation

#### [tests] Task 1.1: Add B1/B2 regression tests + migration-safety test

**Status:** done

**Depends:** None

Add four failing regression tests to `deliveryConsumer.test.ts`. Use existing
`createMockEnv()`, chain builders, and frozen fixtures — no new mock infra.
B3 is deferred; do not add a B3 test here.

**Files:**

- Modify: `apps/workers/src/tests/deliveryConsumer.test.ts`

**Steps (TDD):**

1. Add `"B1: backoff uses platform attempts across redelivery"` — same body,
   second invocation with `attempts: 5` on the message metadata, assert
   `retry({ delaySeconds: 80 })` not `retry({ delaySeconds: 5 })`.
2. Add `"B2-permanent: 401 collapses to DLQ via retry({ delaySeconds: 0 })"` —
   assert `msg.retry({ delaySeconds: 0 })` called; analytics record carries
   `failure_class: "permanent"`. Also cover 404, 410, 422.
3. Add `"B2-transient: 5xx / 408 / 429 retry with backoff"` — assert standard
   backoff applies; `msg.retry({ delaySeconds: 5 })` on first attempt.
4. Add `"R10: old-shape body with attempt:0 is accepted; backoff uses msg.attempts"`
   — old body with `attempt: 0`, new consumer should read `msg.attempts` not `body.attempt`.
5. Run: `pnpm --filter @repo/workers test deliveryConsumer` — verify new tests FAIL,
   existing 11 stay green.

**Acceptance:**

- [x] Four new tests named B1, B2-permanent, B2-transient, R10
- [x] Existing 11 test cases unchanged
- [x] `pnpm --filter @repo/workers test deliveryConsumer` shows the new failures

---

#### [fix] Task 1.2: B1 — use `msg.attempts`; keep field optional (deploy-safe)

**Status:** done

**Depends:** Task 1.1

Replace `msg.body.attempt` with `msg.attempts`. Keep `attempt?: number` optional
in `DeliveryPayload` — do not remove the field or change producers in this task.
Field removal ships as a follow-up release after queue drains.

**Files:**

- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Modify: `apps/workers/src/db/client.ts` (`attempt: number` → `attempt?: number`)
- Modify: `apps/workers/src/tests/deliveryConsumer.test.ts` (update existing
  `"uses correct backoff for higher attempt counts"` to use `attempts` metadata)

**Steps (TDD):**

1. In `db/client.ts`: `attempt: number` → `attempt?: number` in `DeliveryPayload`.
2. In `deliveryConsumer.ts`: replace all usages of `msg.body.attempt` with
   `BACKOFF_SECONDS[Math.min(msg.attempts - 1, BACKOFF_SECONDS.length - 1)]`.
   (1-indexed assumption — if B1 test fails by one step, switch to
   `Math.min(msg.attempts, ...)` and update the comment.)
3. Producers (`routes/message.ts:91`, `routes/topic.ts:98`) **continue** to
   stamp `attempt: 0` — do not change them here.
4. Run: `pnpm --filter @repo/workers test deliveryConsumer` — B1 + R10 PASS.
5. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [x] `DeliveryPayload.attempt` is `attempt?: number` (optional, not removed)
- [x] Producers unchanged (still stamp `attempt: 0`)
- [x] Backoff lookup uses `msg.attempts`
- [x] B1 + R10 regression tests pass
- [x] `check-types` clean

---

#### [fix] Task 1.3: B2 — classify 4xx; route permanents to DLQ

**Status:** done

**Depends:** Task 1.2 (DLQ resource provisioned via `ab0eeb1`)

Distinguish permanent vs transient failures. Route both to DLQ on retry
exhaustion, tagged by `failure_class`.

**Permanent (all 4xx except 408/425/429):** `msg.retry({ delaySeconds: 0 })` —
collapses to DLQ via `max_retries = 5`. Analytics + DLQ message attribute:
`failure_class: "permanent"`.

**Transient (5xx, 408, 425, 429, network throw):** standard backoff retry.
Analytics + DLQ attribute: `failure_class: "transient"`.

**Files:**

- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Create: `apps/workers/src/consumers/failureClassifier.ts`
- Create: `apps/workers/src/tests/failureClassifier.test.ts`
- Modify: `docs/delivery-guarantees.md`

**Steps (TDD):**

1. Write `failureClassifier.test.ts` with explicit code matrix:
   200/204 → "ok", 401/403/404/410/422 → "permanent",
   408/425/429/500/502/503/504 → "transient", throw → "transient".
2. Run: `pnpm --filter @repo/workers test failureClassifier` — FAIL.
3. Implement `classifyFailure(status: number | "throw"): "permanent" | "transient"`.
4. In `deliveryConsumer.ts`, route permanents to `msg.retry({ delaySeconds: 0 })`
   with `failure_class` stamped in telemetry.
5. Update `docs/delivery-guarantees.md` with the code matrix and DLQ-routing policy.
6. Run: `pnpm --filter @repo/workers test` — all green.
7. Run: `pnpm --filter @repo/workers check-types && pnpm --filter @repo/workers lint`.

**Acceptance:**

- [x] `classifyFailure` extracted and unit-tested
- [x] 401/404/410/422 → `msg.retry({ delaySeconds: 0 })` not `msg.ack()`
- [x] 408/425/429/5xx → standard backoff
- [x] `delivery-guarantees.md` documents the status-code matrix
- [x] All gates green

---

#### [docs] Task 1.4: Reconcile README + DLQ wiring

**Status:** done

**Depends:** Task 1.3 (DLQ resource provisioned via `ab0eeb1`)

**Files:**

- Modify: `README.md`
- Modify: `docs/delivery-guarantees.md`

**Steps:**

1. Confirm `infra/src/resources/` provisions `delivery-dlq`.
2. Update README "Delivery rails, honestly stated" to reflect the new policy:
   transient → backoff retry → DLQ after 5 attempts; permanent (4xx except
   408/425/429) → immediate DLQ with `failure_class: "permanent"`.
3. Cross-reference `delivery-guarantees.md`.
4. Run: `pnpm docs:check`.

**Acceptance:**

- [x] `delivery-dlq` is provisioned (verified, not assumed)
- [x] README matches implemented policy
- [x] `delivery-guarantees.md` is source of truth for retry semantics
- [x] `pnpm docs:check` passes

---

## Verification Gates

| Gate          | Command                                                           | Pass criteria                   |
| ------------- | ----------------------------------------------------------------- | ------------------------------- |
| Types         | `pnpm --filter @repo/workers check-types`                         | Zero errors                     |
| Lint          | `pnpm --filter @repo/workers lint`                                | Zero violations                 |
| Tests         | `pnpm --filter @repo/workers test`                                | All green including B1/B2/R10   |
| Docs          | `pnpm docs:check`                                                 | Frontmatter + cross-refs intact |
| E2E           | `pnpm --dir apps/e2e run e2e:run -- --suite messaging`            | Existing suite passes           |
| Deploy canary | `wrangler tail` after deploy, watch for `delaySeconds: undefined` | Zero matches in 1hr             |

## Cross-Plan References

| Type              | Blueprint                                                 | Relationship                                               |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Upstream          | `cf-queues-delivery` (completed)                          | Consumer + payload type this blueprint corrects            |
| Precondition      | `infra-delivery-dlq` (to be drafted)                      | Pulumi `delivery-dlq` resource — hard prereq for 1.3 + 1.4 |
| Follow-on         | `topicroom-dedupe-then-notify-before-ack` (to be drafted) | B3: TopicRoom dedupe first, then ack/notify reorder        |
| Follow-up release | `delivery-payload-attempt-removal` (XS)                   | Drop `attempt?` from payload after queue drains            |

## Edge Cases

| Edge Case                              | Risk   | Solution                                                    | Task     |
| -------------------------------------- | ------ | ----------------------------------------------------------- | -------- |
| 429 Too Many Requests                  | Medium | Transient — backoff gives room                              | 1.3      |
| 410 Gone                               | Medium | Permanent — collapse to DLQ                                 | 1.3      |
| Consumer dies mid-batch                | Medium | CF redelivers; `msg.attempts` increments                    | 1.2      |
| New consumer + old body (`attempt: 0`) | Low    | Consumer ignores body field; reads `msg.attempts`           | 1.1, 1.2 |
| `msg.attempts` is 0-indexed            | Low    | B1 test reveals; flip to `Math.min(msg.attempts, ...)`      | 1.2      |
| B3 silent-drop persists (deferred)     | High   | Accepted limitation; documented in `delivery-guarantees.md` | deferred |

## Non-goals

- Producer crash window between row-write and queue send
- Exactly-once delivery
- DLQ inspection UI
- B3 notify-before-ack reorder (sibling blueprint)
- `attempt` field removal (follow-up release)

## Risks

| Risk                                                                 | Impact   | Mitigation                                                              |
| -------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| Deploy-boundary: old consumer + `attempt`-less body → `BACKOFF[NaN]` | CRITICAL | Field optional; producers unchanged; field removal deferred             |
| B3 reorder alone → duplicate WS broadcast (TopicRoom no dedupe)      | CRITICAL | B3 deferred to sibling                                                  |
| Pulumi DLQ resource missing                                          | HIGH     | Hard prereq on `infra-delivery-dlq` blueprint                           |
| Permanent-failure routing changes subscriber retry expectations      | MEDIUM   | `failure_class` observable in analytics; CHANGELOG note                 |
| Rollback difficulty for Task 1.3                                     | MEDIUM   | Tasks are separate commits; revert 1.3 alone restores previous behavior |

## Technology Choices

| Component              | Technology                                                                | Why                               |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Attempt counter        | `msg.attempts` (`@cloudflare/workers-types@4.20260423.1` index.d.ts:2367) | Platform-native, no schema change |
| Failure classification | Hard-coded HTTP code list in `failureClassifier.ts`                       | Predictable, cheap to audit       |
| DLQ                    | `delivery-dlq` (declared; Pulumi pending)                                 | No new infra once provisioned     |
