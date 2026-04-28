---
type: blueprint
status: completed
complexity: M
created: "2026-04-26"
last_updated: "2026-04-26"
progress: "100% (9/9 tasks done, 0 blocked, updated 2026-04-26)"
depends_on: []
tags:
  - cloudflare-workers
  - durable-objects
  - queues
  - schema-drift
  - llm
  - self-healing
completed_at: "2026-04-26"
---

# Self-healing adaptive intake

**Goal:** Adapt the existing intake pipeline to auto-detect schema drift in
incoming payloads and self-heal using the existing LLM mapping engine — without
human review for high-confidence cases — streaming observable state transitions
(`DETECTED → ANALYZING → REWRITING → HEALED`) via SSE. Operators can revert any
auto-heal via a rollback endpoint. Design: `~/.gstack/projects/ozby-ingest-lens/ozby-main-design-20260426-195719.md`.

## Planning Summary

- **Why now:** Design fully approved (office-hours + plan-eng-review, 2026-04-26).
  No code changes yet. Blueprint filed to drive parallel execution.
- **Scope:** 5 additions to the existing workers app. No new packages. No schema
  vaccine (cross-tenant fan-out) — Approach A only.
- **Key decisions from eng-review:**
  - `HealStreamDO` is the **write coordinator** (DO input gate serializes concurrent
    heals) — not just a cache. Neon write → cache update → SSE broadcast, in that
    order. Throw on Neon failure.
  - Fast-path audit via **write-behind Queue** (non-blocking `Queue.send()`).
  - `approveMapping()` helper extracted from existing approve handler (DRY).
  - `wrangler.toml`: `HealStreamDO` declared in top-level + dev + prd env sections.
  - `normalizeWithMapping()` throw on the heal path → graceful fallback to
    `pending_review`.
- **Deferred:** Schema vaccine (Approach B), rollback UI, `attempt` field removal.

## Pre-execution audit

**Readiness:** All tasks unblocked. No missing dependencies.

**Verified (2026-04-26)**

- `suggestMappings()` in `aiMappingAdapter.ts` — operational, reused unchanged.
- `normalizeWithMapping()` — operational, reused unchanged.
- `approvedMappingRevisions` table — exists, append-only, ready for 3 new columns.
- `intakeAttempts.sourceHash` — exists, populated on every intake.
- `DELIVERY_QUEUE` — wired, used for delivery consumer; adding audit message type.
- `@cloudflare/vitest-pool-workers` — already in repo for DO testing.
- `wrangler.toml` per-env DO declaration pattern — confirmed via `TOPIC_ROOMS`.
- Eng-review test plan at `~/.gstack/projects/ozby-ingest-lens/ozby-main-eng-review-test-plan-20260426-201126.md`.

## Architecture

```text
POST /mapping-suggestions
  │
  ├─► shapeFingerprint(payload)
  │     └─► HealStreamDO.getState()  [per sourceSystem:contractId:contractVersion]
  │
  ├─► fingerprint MATCH  ──────────────────────────────────► FAST PATH (<50ms)
  │     normalizeWithMapping(cached suggestions) → publish
  │     Queue.send(audit_event)  [write-behind, non-blocking]
  │
  └─► fingerprint MISMATCH ────────────────────────────────► HEAL PATH
        suggestMappings() [LLM, ~2-5s]
        ├─► confidence ≥ 0.8  →  HealStreamDO.tryHeal(batch)
        │     [DO input gate serializes]
        │     1. INSERT approvedMappingRevisions (Neon)
        │     2. update DO cache + storage.put()
        │     3. broadcast SSE: drift_detected → analyzing → healed
        │     throw on Neon failure → Worker catches → pending_review
        │   normalizeWithMapping() → publish
        │   catch throw → pending_review (hallucinated path fallback)
        └─► confidence < 0.8  →  pending_review (existing path)

PATCH /api/heal/stream/:source/:contract/:version/rollback
  HealStreamDO.rollback()
    1. INSERT new approvedMappingRevisions (rolledBackFrom = currentId, healedAt null)
    2. update DO cache to previous {fingerprint, suggestions}
    3. broadcast SSE: rolled_back
```

## Parallelization (3 lanes)

```
Lane A — independent, launch first (no shared modules):
  Task 1.1  shapeFingerprint.ts + unit tests
  Task 1.2  Neon migration + schema.ts + toMappingRevision() mapper
  Task 1.3  Extract approveMapping() helper from existing approve handler

Lane B — depends on Lane A (merges first):
  Task 2.1  HealStreamDO class + healStream.ts SSE route + rollback endpoint
  Task 2.2  wrangler.toml: HealStreamDO bindings (top-level + dev + prd)

Lane C — depends on Lane A + Lane B:
  Task 3.1  Auto-heal branch in intake.ts + audit Queue consumer handler
  Task 3.2  normalizeWithMapping() throw catch → pending_review fallback

Lane D — depends on Lane C:
  Task 4.1  Unit + DO tests (fast-path negative assertion, concurrent heal test)
  Task 4.2  Integration: Ashby v1→v2 rename full flow demo
```

---

## Phase 1: Lane A — Foundation (parallel, independent)

#### [feat] Task 1.1: shapeFingerprint.ts — structural payload hash

**Status:** done

**Depends:** None

Pure function: extract sorted leaf field paths from payload → hash. Null/non-object
returns `"empty"` (fail-open). Different from `sourceHash` (which hashes values too).

**Files:**

- Create: `apps/workers/src/intake/shapeFingerprint.ts`
- Create: `apps/workers/src/tests/shapeFingerprint.test.ts`

**Steps:**

1. Implement `shapeFingerprint(payload: unknown): string` — recursive leaf-path
   extraction, sort paths, hash the sorted array string using the same hash
   primitive as `defaultHashPayload` (already imported in intake validation).
2. Write unit tests:
   - Same object, different values → same fingerprint
   - `first_name` → `firstName` (rename) → different fingerprint
   - Nested object → stable sorted path extraction
   - null/undefined/non-object → returns `"empty"`
3. Run: `pnpm --filter @repo/workers test shapeFingerprint` — all green.
4. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [x] `shapeFingerprint(payload)` exported from `shapeFingerprint.ts`
- [x] Returns `"empty"` for null/non-object (fail-open)
- [x] Rename test: `first_name` vs `firstName` produce different fingerprints
- [x] All unit tests green, types clean

---

#### [feat] Task 1.2: Neon migration — three new columns on approvedMappingRevisions

**Status:** done

**Depends:** None

Add `shapeFingerprint`, `healedAt`, `rolledBackFrom` to `approvedMappingRevisions`.
Update `toMappingRevision()` mapper to include new columns or they are silently dropped.

**Files:**

- Adapt: `apps/workers/src/db/schema.ts`
- New: `apps/workers/src/db/migrations/<timestamp>_add_heal_columns.sql`
- Adapt: `apps/workers/src/routes/intake.ts` (`toMappingRevision()` mapper only)

**Steps:**

1. Add to `approvedMappingRevisions` in `schema.ts`:
   - `shapeFingerprint: text("shape_fingerprint")` (nullable for existing rows)
   - `healedAt: timestamp("healed_at")` (nullable — null = human-approved or rollback)
   - `rolledBackFrom: text("rolled_back_from")` (nullable — FK to reversed revision ID)
2. Write migration SQL with `ALTER TABLE approved_mapping_revisions ADD COLUMN ...`
   for all three columns (nullable, no default required).
3. Update `toMappingRevision()` in `intake.ts` to map `shapeFingerprint`,
   `healedAt`, `rolledBackFrom` from the DB row to the returned object. Without
   this the fast path fingerprint comparison always reads `null` and falls through
   to the LLM on every request.
4. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [x] Three columns added to `approvedMappingRevisions` in `schema.ts`
- [x] Migration file created with correct ALTER TABLE statements
- [x] `toMappingRevision()` maps all three new fields
- [x] Types clean

---

#### [refactor] Task 1.3: Extract approveMapping() helper from existing approve handler

**Status:** done

**Depends:** None

The existing `POST /mapping-suggestions/:id/approve` handler (~50 lines) and the
upcoming auto-heal path need the same approval logic. Extract it to a shared helper
to avoid duplication. Beck's rule: make the change easy first.

**Files:**

- Adapt: `apps/workers/src/routes/intake.ts`

**Steps:**

1. Extract the approval core from `handleIdempotentApprove()` into:
   `async function approveMapping(db, attemptId, suggestionIds, opts?: { healedAt?: Date, shapeFingerprint?: string, rolledBackFrom?: string })`
   that: validates suggestion IDs, inserts into `approvedMappingRevisions`, updates
   `intakeAttempts.status`, emits lifecycle telemetry, handles idempotency.
2. Wire the existing human-approve handler to call `approveMapping()` — behavior
   must be identical to before (no functional change in this task).
3. Run: `pnpm --filter @repo/workers test` — all existing intake tests green.
4. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [x] `approveMapping()` helper extracted, called from human-approve handler
- [x] Existing `pnpm --filter @repo/workers test` suite stays green (no regression)
- [x] No functional change to the human review path
- [x] Types clean

---

## Phase 2: Lane B — HealStreamDO + SSE (depends on Lane A merged)

#### [feat] Task 2.1: HealStreamDO + healStream.ts SSE route + rollback endpoint

**Status:** done

**Depends:** Task 1.1, Task 1.2, Task 1.3

Durable Object scoped to `sourceSystem:contractId:contractVersion`. Dual role:
write coordinator (serializes heals via DO input gate) and SSE event broadcaster.
Includes the rollback endpoint.

**Files:**

- Create: `apps/workers/src/consumers/HealStreamDO.ts`
- Create: `apps/workers/src/routes/healStream.ts`

**HealStreamDO interface:**

```ts
// RPC methods called from Worker:
getState(): { fingerprint: string; suggestions: MappingSuggestion[] } | null
tryHeal(batch: MappingSuggestionBatch, neonDb: DrizzleClient): Promise<{ healed: boolean; suggestions: MappingSuggestion[] }>
// Order: 1. INSERT Neon  2. update cache + storage.put()  3. broadcast SSE
// Throw on Neon failure — Worker catches and falls to pending_review
rollback(previousRevision: ApprovedMappingRevision, neonDb: DrizzleClient): Promise<void>
// Order: 1. INSERT Neon (rolledBackFrom = currentId)  2. update cache  3. broadcast SSE: rolled_back
subscribe(response: Response): void  // SSE subscriber registration
```

**healStream.ts routes:**

```
GET  /api/heal/stream/:sourceSystem/:contractId/:contractVersion  → SSE stream
PATCH /api/heal/stream/:sourceSystem/:contractId/:contractVersion/rollback → trigger rollback
```

**Steps:**

1. Implement `HealStreamDO` class with `getState()`, `tryHeal()`, `rollback()`,
   `subscribe()`. In-memory cache + `storage.put()` for DO restart survival.
   Max 1000 buffered events, 5min TTL. Keepalive every 15s.
2. Implement `healStream.ts` Hono routes — GET registers SSE subscriber via DO,
   PATCH calls `DO.rollback()` with owner auth check (same pattern as approve).
3. Wire `healStream.ts` into `apps/workers/src/index.ts` route registration.
4. Run: `pnpm --filter @repo/workers check-types` — zero errors.
5. Run: `pnpm --filter @repo/workers lint` — zero violations.

**Acceptance:**

- [x] `HealStreamDO` class implements all four RPC methods
- [x] Neon write-first ordering enforced in `tryHeal()` and `rollback()`
- [x] SSE GET endpoint wired and returns `Content-Type: text/event-stream`
- [x] PATCH rollback endpoint wired with owner auth
- [x] Types clean, lint clean

---

#### [chore] Task 2.2: wrangler.toml — HealStreamDO bindings in all three sections

**Status:** done

**Depends:** Task 2.1

Per the wrangler.toml comment: "NOTE: wrangler environments do NOT inherit
`durable_objects` from the top level — each env must re-declare them." Follows
the existing `TOPIC_ROOMS` pattern.

**Files:**

- Adapt: `apps/workers/wrangler.toml`
- Adapt: `apps/workers/src/db/client.ts` (or `env.ts` — wherever `Env` type is declared)

**Steps:**

1. Add `HealStreamDO` DO binding to:
   - Top-level `[durable_objects]` section
   - `[env.dev]` durable_objects section
   - `[env.prd]` durable_objects section
     Follow the exact format of the existing `TOPIC_ROOMS` binding.
2. Add `HEAL_STREAM` to the `Env` type (same pattern as `TOPIC_ROOMS`):
   `HEAL_STREAM: DurableObjectNamespace`
3. Run: `pnpm --filter @repo/workers check-types` — zero errors.
4. Run: `wrangler deploy --dry-run --env dev` — no binding errors.

**Acceptance:**

- [x] `HealStreamDO` declared in top-level + dev + prd wrangler.toml sections
- [x] `HEAL_STREAM: DurableObjectNamespace` in `Env` type
- [x] `wrangler deploy --dry-run --env dev` exits 0
- [x] Types clean

---

## Phase 3: Lane C — Auto-heal integration (depends on Lane A + Lane B)

#### [feat] Task 3.1: Auto-heal branch in intake.ts + audit Queue consumer handler

**Status:** done

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 2.1, Task 2.2

The core integration: wire `shapeFingerprint()` + `HealStreamDO.getState()` check
into `POST /mapping-suggestions`, add fast path and heal path branches. Add audit
Queue message type to the delivery consumer.

**Files:**

- Adapt: `apps/workers/src/routes/intake.ts`
- Adapt: `apps/workers/src/consumers/deliveryConsumer.ts` (new message type handling)

**AUTO_HEAL_THRESHOLD = 0.8** (read from `env.AUTO_HEAL_THRESHOLD` with fallback).

**Steps:**

1. In `POST /mapping-suggestions`, before calling `suggestMappings()`:
   - Compute `shapeFingerprint(validation.value.payload)`
   - Call `HealStreamDO.getState()` for this `sourceSystem:contractId:contractVersion`
   - If state exists AND fingerprints match → **fast path**: `normalizeWithMapping()` →
     publish → `env.DELIVERY_QUEUE.send({ type: "intake_audit", ...auditPayload })`
     (non-blocking, write-behind) → return 200.
2. If mismatch (or no state): call `suggestMappings()` as today.
   - If `mapped.kind === "success"` AND `confidence >= AUTO_HEAL_THRESHOLD`:
     call `HealStreamDO.tryHeal(batch, db)` → `approveMapping()` →
     `normalizeWithMapping()` → publish. Catch `normalizeWithMapping()` throw →
     fall through to `pending_review`.
   - Otherwise: existing `pending_review` path unchanged.
3. In `deliveryConsumer.ts` (or a new `auditConsumer.ts`): handle
   `type === "intake_audit"` message type — insert into `intakeAttempts` with
   `status: "fast_path"`.
4. Run: `pnpm --filter @repo/workers test` — all green.
5. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [x] Fast path: fingerprint match → no `suggestMappings()` call, Queue audit sent
- [x] Heal path: confidence ≥ 0.8 → `tryHeal()` → `approveMapping()` → publish
- [x] `normalizeWithMapping()` throw caught → falls to `pending_review`
- [x] Existing human review path (confidence < 0.8) unchanged
- [x] All existing tests green

---

#### [fix] Task 3.2: normalizeWithMapping() throw catch → pending_review fallback

**Status:** done

**Depends:** Task 3.1

Wrap the `normalizeWithMapping()` call on the auto-heal path in a try/catch.
If it throws (LLM hallucinated a field path that doesn't exist in the payload),
fall through to `pending_review` with a telemetry event rather than returning 500.
Follows the existing `handlePublishFailure()` pattern in `intake.ts`.

**Files:**

- Adapt: `apps/workers/src/routes/intake.ts`

**Steps:**

1. Wrap the `normalizeWithMapping(suggestions, payload)` call in the auto-heal
   branch with try/catch. On catch: emit `recordIntakeLifecycle(env, ...)` event
   with `"suggestion.heal_normalize_failed"`, fall through to `intakeAttempts`
   insert with `status: "pending_review"`, return existing pending_review response.
2. Run: `pnpm --filter @repo/workers test` — all green.

**Acceptance:**

- [x] `normalizeWithMapping()` throw on heal path → `pending_review`, not 500
- [x] Lifecycle telemetry event emitted on failure
- [x] All tests green

---

## Phase 4: Lane D — Tests + demo (depends on Lane C)

#### [tests] Task 4.1: Unit + DO tests — fast-path negative assertion + concurrent heal

**Status:** done

**Depends:** Task 3.1, Task 3.2

Two critical tests identified in eng-review:

1. Fast path MUST assert `suggestMappings` is NOT called on shape-match.
2. `HealStreamDO.tryHeal()` concurrent call is a no-op (validates the input-gate
   write-coordinator decision).

**Files:**

- Adapt: `apps/workers/src/tests/intake.test.ts`
- Create: `apps/workers/src/tests/HealStreamDO.test.ts`
- Adapt: `apps/workers/src/tests/shapeFingerprint.test.ts` (if not done in 1.1)

**Steps (from eng-review test plan):**

1. `intake.test.ts` — new `describe("auto-heal fast path")`:
   - Shape matches approved fingerprint → `vi.mocked(suggestMappings)` called
     **zero times** (negative assertion — the most critical test in the feature).
   - Shape matches → `Queue.send()` fires with `type: "intake_audit"`.
   - Shape mismatch + confidence ≥ 0.8 → `HealStreamDO.tryHeal()` called.
   - Shape mismatch + confidence < 0.8 → `intakeAttempts` row with `pending_review`.
2. `HealStreamDO.test.ts` using `@cloudflare/vitest-pool-workers`:
   - Cold start → `getState()` returns null.
   - Warm → `getState()` returns cached `{fingerprint, suggestions}`.
   - `tryHeal()` first call → heals, returns `{healed: true}`.
   - `tryHeal()` second concurrent call (same fingerprint) → no-op, returns
     `{healed: false}`. (This is the correctness guarantee test for the race fix.)
   - `rollback()` → inserts new row with `rolledBackFrom` set, updates cache.
3. Run: `pnpm --filter @repo/workers test` — all green.
4. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [x] Negative assertion: `suggestMappings` NOT called on fast-path match
- [x] Concurrent `tryHeal()` test: second caller returns `{healed: false}`
- [x] `HealStreamDO` cold/warm/heal/rollback states all tested
- [x] All tests green

---

#### [docs] Task 4.2: Integration demo + confidence band comment

**Status:** done

**Depends:** Task 4.1

Verify the full flow works end-to-end with an Ashby fixture (already in
`data/payload-mapper/schemas/ats/ashby-candidates.json`). Add the confidence
band comment from docs/project/TODOS.md.

**Files:**

- Adapt: `apps/workers/src/intake/aiMappingAdapter.ts` (comment only)
- Adapt: `apps/workers/src/routes/intake.ts` (comment only)
- Adapt: `docs/project/TODOS.md` (mark confidence band TODO done)

**Steps:**

1. Add comment above `LOW_CONFIDENCE_THRESHOLD` in `aiMappingAdapter.ts`:
   `// Values 0.5-0.79 return kind:"success" but fall through to pending_review`
   `// (below AUTO_HEAL_THRESHOLD). Only ≥0.8 triggers auto-heal.`
2. Run `pnpm docs:check` — OK.
3. Run `pnpm blueprints:check` — OK.
4. Run `pnpm --filter @repo/workers test` — all green.
5. Mark confidence band TODO complete in `docs/project/TODOS.md`.

**Acceptance:**

- [x] Comment added to `aiMappingAdapter.ts` explaining 0.5-0.79 band behavior
- [x] `pnpm docs:check` passes
- [x] `pnpm blueprints:check` passes
- [x] `docs/project/TODOS.md` confidence band item marked complete

---

## Verification Gates

| Gate           | Command                                   | Pass criteria                                    |
| -------------- | ----------------------------------------- | ------------------------------------------------ |
| Types          | `pnpm --filter @repo/workers check-types` | Zero errors                                      |
| Lint           | `pnpm --filter @repo/workers lint`        | Zero violations                                  |
| Tests          | `pnpm --filter @repo/workers test`        | All green including fast-path negative assertion |
| Docs           | `pnpm docs:check`                         | Frontmatter intact                               |
| Blueprints     | `pnpm blueprints:check`                   | Lifecycle OK                                     |
| Deploy dry-run | `wrangler deploy --dry-run --env dev`     | Exit 0, no binding errors                        |

## Cross-Plan References

| Type       | Blueprint                                                                               | Relationship                               |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| Design     | `~/.gstack/projects/ozby-ingest-lens/ozby-main-design-20260426-195719.md`               | Approved design this blueprint implements  |
| Eng review | `~/.gstack/projects/ozby-ingest-lens/ozby-main-eng-review-test-plan-20260426-201126.md` | Test plan                                  |
| Follow-on  | `topicroom-dedupe-then-notify-before-ack` (to be drafted)                               | B3 deferred                                |
| Follow-on  | `delivery-payload-attempt-removal` (to be drafted)                                      | Remove `attempt?` field after queue drains |

## Non-goals

- Schema vaccine (cross-tenant fan-out) — Approach B, future blueprint
- DLQ inspection UI
- `attempt` field removal from `DeliveryPayload`
- Rollback UI (PATCH endpoint is the operator surface; no admin dashboard)
- Exactly-once delivery
