---
type: blueprint
status: planned
complexity: M
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0% (refined)"
depends_on:
  - durable-objects-fan-out
tags:
  - cloudflare-workers
  - durable-objects
  - replay
  - cursor
  - reliability
---

# Message replay cursor

**Goal:** Add monotonically increasing sequence numbers to persisted messages
and use `TopicRoom` SQLite storage to replay missed topic messages to a client
that reconnects with a cursor.

## Planning Summary

- **Why now:** Once `durable-objects-fan-out` exists, realtime subscribers need
  a reconnect story better than “you missed it”.
- **Scope:** Add a `seq` column to Postgres-backed messages, store recent topic
  messages in `TopicRoom` SQLite, and replay `seq > cursor` on reconnect.
- **Out of scope:** Long-term archival, permanent per-user cursor storage, D1,
  and Pipelines.

## Refinement Summary

- Added migration-tooling bootstrap work because the current `apps/workers`
  workspace does **not** yet contain `drizzle.config.ts` or a migrations
  directory.
- Kept the data plane on Postgres via Hyperdrive; there is no D1 branch in this
  blueprint.
- Kept replay window intentionally short and operational: reconnect / browser
  catch-up, not full event sourcing.

## Pre-execution audit (2026-04-22)

**Readiness:** blocked-by-upstream

**What is already true**

- The installed Drizzle version includes `bigserial()`.
- Postgres via Hyperdrive is already the durable message store, so adding a
  sequence column there is consistent with the current architecture.

**Blocking gaps**

- This blueprint depends on `durable-objects-fan-out`, which has not landed yet.
- The Worker workspace currently lacks `apps/workers/drizzle.config.ts` and a
  migrations directory, so migration tooling must be bootstrapped before the
  sequence-column step becomes executable.
- There is no `TopicRoom` implementation yet, so replay storage cannot be added
  until the DO surface exists.

**First-build notes**

- Bootstrap Drizzle config and migrations first; otherwise the documented
  generation command is aspirational.
- Keep the replay window narrow and operational. This is reconnect catch-up,
  not long-term event history.
- Keep D1 out of scope; the current data plane already has the right durable
  store for this feature.

## Architecture Overview

```text
publish path
  → insert message row with seq in Postgres
  → queue consumer acks external delivery
  → TopicRoom /notify persists { seq, payload, created_at } in SQLite

reconnect path
  GET /api/topics/:topicId/ws?cursor=42
    → TopicRoom looks up seq > 42 in msg_log
    → sends missed messages in seq order
    → joins live stream
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                                                  | Source                                                 |
| --- | -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| F1  | HIGH     | SQLite-backed Durable Objects expose SQL and PITR APIs.                                                | Durable Objects SQLite docs, fetched 2026-04-22.       |
| F2  | HIGH     | The repo already uses Postgres via Hyperdrive, so sequence assignment belongs there rather than in D1. | Repo inspection + research artifact, 2026-04-22.       |
| F3  | MEDIUM   | `bigserial()` is available in the installed Drizzle version.                                           | Local package inspection of `drizzle-orm`, 2026-04-22. |

## Key Decisions

| Decision        | Choice                                    | Rationale                                                                |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Sequence source | Postgres `bigserial` column on `messages` | Durable source of ordering truth already co-located with the message row |
| Replay store    | `TopicRoom` SQLite `msg_log` table        | Fast replay close to the live fan-out path                               |
| Replay window   | 1 hour                                    | Covers reconnects without pretending to be long-term archive             |
| Eviction        | Inline delete on notify                   | KISS; no separate alarm loop required initially                          |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable |
| ----------------- | --------------- | ------------ | -------------- |
| **Wave 1**        | 1.1, 1.2        | None         | 2 agents       |
| **Wave 2**        | 1.3             | 1.1 + 1.2    | 1 agent        |
| **Wave 3**        | 1.4             | 1.3          | 1 agent        |
| **Critical path** | 1.1 → 1.3 → 1.4 | —            | 3 waves        |

---

### Phase 1: Migration bootstrap, sequence column, and replay wiring [Complexity: M]

#### [migrations] Task 1.1: Bootstrap Worker migration tooling

**Status:** pending

**Depends:** None

Create the missing Drizzle config and migrations directory for the Worker
workspace so later schema changes are reproducible.

**Files:**

- Create: `apps/workers/drizzle.config.ts`
- Create: `apps/workers/src/db/migrations/.gitkeep`

**Steps (TDD):**

1. Create `apps/workers/drizzle.config.ts` targeting the existing schema file
   and migrations folder.
2. Create `apps/workers/src/db/migrations/.gitkeep` so the path exists before
   generation.
3. Run: `pnpm --filter @repo/workers exec drizzle-kit generate --config drizzle.config.ts`
   — verify the command resolves successfully once schema changes land.

**Acceptance:**

- [ ] `apps/workers/drizzle.config.ts` exists
- [ ] `apps/workers/src/db/migrations/` exists
- [ ] The generation command is now realistic for this workspace

---

#### [db] Task 1.2: Add `seq` to the message schema

**Status:** pending

**Depends:** None

Add a monotonic sequence column to the Postgres-backed `messages` table.

**Files:**

- Modify: `apps/workers/src/db/schema.ts`

**Steps (TDD):**

1. Add a `seq` column using Drizzle's `bigserial()` support.
2. Run: `pnpm --filter @repo/workers exec drizzle-kit generate --config drizzle.config.ts`
   — create a migration for the new column.
3. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] `messages` has a `seq` column in schema
- [ ] A migration can be generated from the Worker workspace
- [ ] `pnpm --filter @repo/workers check-types` passes

---

#### [do] Task 1.3: Extend `TopicRoom` with replay storage

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Extend `TopicRoom` so `/notify` stores recent messages in SQLite and `/ws`
replays `seq > cursor` before joining the live stream.

**Files:**

- Modify: `apps/workers/src/do/TopicRoom.ts`
- Modify: `apps/workers/src/tests/TopicRoom.test.ts`

**Steps (TDD):**

1. Add tests for:
   - notify persists `{ seq, payload }`
   - reconnect with `?cursor=` replays in ascending seq order
   - inline eviction removes rows older than the retention window
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Add a SQLite `msg_log` table and replay logic to `TopicRoom`.
4. Run: `pnpm --filter @repo/workers test` — verify PASS.

**Acceptance:**

- [ ] `TopicRoom` stores replayable messages in SQLite
- [ ] Reconnect with `cursor` replays missed messages in order
- [ ] Old replay rows are evicted inline

---

#### [wire] Task 1.4: Pass `seq` through the queue and DO notify path

**Status:** pending

**Depends:** Task 1.3

Make sure the queue / consumer / DO path carries the sequence number needed for
replay.

**Files:**

- Modify: `apps/workers/src/db/client.ts`
- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/routes/topic.ts`
- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Modify: `apps/workers/src/tests/deliveryConsumer.test.ts`

**Steps (TDD):**

1. Extend `DeliveryPayload` with `seq: bigint`.
2. Populate `seq` from the inserted message row in both direct-send and
   topic-publish flows.
3. Include `seq` in the DO notify payload after successful delivery ack.
4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] `seq` flows from Postgres insert → queue payload → DO notify → SQLite log
- [ ] Replay logic no longer depends on ad hoc ordering assumptions
- [ ] Full targeted tests pass

---

## Verification Gates

| Gate           | Command                                                                            | Success Criteria                             |
| -------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| Types          | `pnpm --filter @repo/workers check-types`                                          | Zero errors                                  |
| Lint           | `pnpm --filter @repo/workers lint`                                                 | Zero violations                              |
| Tests          | `pnpm --filter @repo/workers test`                                                 | All suites green                             |
| Migration      | `pnpm --filter @repo/workers exec drizzle-kit generate --config drizzle.config.ts` | Command succeeds and writes migration output |
| Deploy dry-run | `pnpm --filter @repo/workers build`                                                | Exit 0                                       |

## Cross-Plan References

| Type     | Blueprint                 | Relationship                                                 |
| -------- | ------------------------- | ------------------------------------------------------------ |
| Upstream | `durable-objects-fan-out` | Extends the same `TopicRoom` DO introduced there             |
| Upstream | `cf-queues-delivery`      | Extends the queue payload and consumer path introduced there |

## Edge Cases and Error Handling

| Edge Case                                        | Risk   | Solution                                                                          | Task |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------- | ---- |
| `cursor` is ahead of the highest stored sequence | Low    | Replay query returns no rows; client joins live stream immediately                | 1.3  |
| Older messages predate the `seq` migration       | Medium | Roll migration before enabling replay routes broadly                              | 1.2  |
| Replay window is too short for a long disconnect | Medium | Keep the first implementation intentionally narrow and document the 1-hour window | 1.3  |

## Non-goals

- Long-term archive
- Per-user durable cursor storage across sessions
- D1
- Pipelines

## Risks

| Risk                                                | Impact | Mitigation                                                                        |
| --------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| The Worker workspace has no migration history today | Medium | Bootstrap Drizzle config and migrations before adding replay-specific schema work |

## Technology Choices

| Component      | Technology                       | Version        | Why                                                        |
| -------------- | -------------------------------- | -------------- | ---------------------------------------------------------- |
| Ordering truth | Postgres `bigserial` via Drizzle | Existing stack | Reuses the durable data plane already present in the repo  |
| Replay cache   | TopicRoom SQLite                 | CF platform    | Co-locates replay with live fan-out and reconnect handling |
