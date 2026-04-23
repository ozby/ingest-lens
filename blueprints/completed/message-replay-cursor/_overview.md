---
type: blueprint
status: completed
complexity: M
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "100% (implemented and verified)"
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
  messages in `TopicRoom` SQLite, and replay messages after a DO-issued cursor
  on reconnect while carrying `seq` as a decimal string across queue / DO /
  WebSocket JSON boundaries.
- **Out of scope:** Long-term archival, permanent per-user cursor storage, D1,
  and Pipelines.

## Refinement Summary

- Verified that `apps/workers/drizzle.config.ts` and
  `apps/workers/src/db/migrations/` already exist, so migration tooling is a
  completed prerequisite rather than new work.
- Removed the stale upstream blocker: `TopicRoom`, the DO binding, the WebSocket
  route, and the consumer-side DO notify path are already present in repo head.
- Tightened the transport contract so `seq` remains a Postgres `bigserial`, but
  crosses queue / DO / WebSocket JSON boundaries as a decimal string to avoid
  BigInt serialization hazards.
- Kept replay window intentionally short and operational: reconnect / browser
  catch-up, not full event sourcing.

## Pre-execution audit (2026-04-22, updated 2026-04-22)

**Readiness:** ready

**What is already true**

- `apps/workers/drizzle.config.ts` already points at `./src/db/schema.ts` and
  `./src/db/migrations`, and the migrations directory exists.
- `TopicRoom` is already implemented, exported from `src/index.ts`, and wired
  through `TOPIC_ROOMS`.
- `apps/workers/src/routes/topic.ts` already exposes
  `GET /api/topics/:topicId/ws`, and `deliveryConsumer.ts` already notifies the
  DO when `topicId` is present.
- `message.test.ts`, `topic.test.ts`, and `deliveryConsumer.test.ts` already
  assert the queue + DO wiring that replay will extend.

**Main gaps before implementation**

- `apps/workers/src/db/schema.ts` still lacks a monotonic `seq` column on
  `messages`.
- `DeliveryPayload` and the queue send paths do not yet carry `seq`.
- `TopicRoom` currently broadcasts only; it does not persist a replay log or
  parse `?cursor=`.
- Reconnect behavior for malformed or stale cursors is not covered yet.

**First-build notes**

- Keep `bigserial` as the database source of truth, but serialize `seq` as a
  decimal string on queue / DO / WebSocket JSON boundaries.
- Preserve the current live fan-out path: reconnect without a cursor should
  still join the live stream immediately.
- Use `DATABASE_URL=postgresql://localhost/test` (or another valid URL) when
  invoking `drizzle-kit generate` from this workspace so the checked-in config
  resolves cleanly.

## Architecture Overview

```text
publish path
  → insert message row with seq in Postgres
  → queue consumer acks external delivery
  → TopicRoom /notify persists { replay_cursor, seq, payload, created_at } in SQLite
    → WebSocket payloads carry both `cursor` and `seq`

reconnect path
  GET /api/topics/:topicId/ws?cursor=42
    → TopicRoom looks up replay_cursor > 42 in msg_log
    → sends missed messages in DO emission order
    → joins live stream
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                                                                      | Source                                                              |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| F1  | HIGH     | SQLite-backed Durable Objects expose SQL and PITR APIs.                                                                    | Durable Objects SQLite docs, fetched 2026-04-22.                    |
| F2  | HIGH     | The repo already uses Postgres via Hyperdrive, so sequence assignment belongs there rather than in D1.                     | Repo inspection + research artifact, 2026-04-22.                    |
| F3  | MEDIUM   | `bigserial()` is available in the installed Drizzle version.                                                               | Local package inspection of `drizzle-orm`, 2026-04-22.              |
| F4  | MEDIUM   | `drizzle-kit generate` is already realistic in this workspace because the checked-in config + migrations path exist today. | Drizzle Kit generate docs + local command verification, 2026-04-22. |

## Key Decisions

| Decision           | Choice                                            | Rationale                                                                        |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Sequence source    | Postgres `bigserial` column on `messages`         | Durable source of ordering truth already co-located with the message row         |
| Sequence transport | Decimal string across Queue / DO / WebSocket JSON | Preserves ordering without tripping BigInt JSON serialization limits             |
| Replay cursor      | DO-local monotonic cursor issued on `/notify`     | Tracks actual live emission order even when consumer retries reorder ack success |
| Replay store       | `TopicRoom` SQLite `msg_log` table                | Fast replay close to the live fan-out path                                       |
| Replay window      | 1 hour                                            | Covers reconnects without pretending to be long-term archive                     |
| Eviction           | Inline delete on notify                           | KISS; no separate alarm loop required initially                                  |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable    |
| ----------------- | --------------- | ------------ | ----------------- |
| **Wave 0**        | 1.1             | None         | 1 agent           |
| **Wave 1**        | 1.2             | None         | 1 agent           |
| **Wave 2**        | 1.3             | 1.2          | 1 agent           |
| **Wave 3**        | 1.4             | 1.3          | 1 agent           |
| **Critical path** | 1.2 → 1.3 → 1.4 | —            | 3 remaining waves |

> Wave 0 is already complete in repo head. The remaining replay work is intentionally
> sequential because the `seq` contract must exist before `TopicRoom` can persist and
> replay it safely.

---

### Phase 1: Migration bootstrap, sequence column, and replay wiring [Complexity: M]

#### [migrations] Task 1.1: Confirm Worker migration tooling baseline

**Status:** done

**Depends:** None

Keep the existing Drizzle config + migrations directory as the verified
baseline for later replay-specific schema work.

**Files:**

- Create: `apps/workers/drizzle.config.ts`
- Create: `apps/workers/src/db/migrations/.gitkeep`

**Steps (TDD):**

1. Verify `apps/workers/drizzle.config.ts` targets the existing schema file
   and migrations folder.
2. Verify `apps/workers/src/db/migrations/.gitkeep` keeps the migrations path in
   version control.
3. Run: `DATABASE_URL=postgresql://localhost/test pnpm --filter @repo/workers exec drizzle-kit generate --config drizzle.config.ts`
   — verify the current workspace wiring resolves cleanly.

**Acceptance:**

- [x] `apps/workers/drizzle.config.ts` exists
- [x] `apps/workers/src/db/migrations/` exists
- [x] The generation command is now realistic for this workspace

---

#### [db] Task 1.2: Add `seq` to the message schema

**Status:** done

**Depends:** None

Add a monotonic sequence column to the Postgres-backed `messages` table.

**Files:**

- Modify: `apps/workers/src/db/schema.ts`

**Steps (TDD):**

1. Add a `seq` column using Drizzle's `bigserial()` support.
2. Run: `DATABASE_URL=postgresql://localhost/test pnpm --filter @repo/workers exec drizzle-kit generate --config drizzle.config.ts`
   — create a migration for the new column.
3. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [x] `messages` has a `seq` column in schema
- [x] A migration can be generated from the Worker workspace
- [x] `pnpm --filter @repo/workers check-types` passes

---

#### [do] Task 1.3: Extend `TopicRoom` with replay storage

**Status:** done

**Depends:** Task 1.1, Task 1.2

Extend `TopicRoom` so `/notify` stores recent messages in SQLite and `/ws`
replays DO-issued cursor positions before joining the live stream, rejecting malformed
cursors before the socket upgrades.

**Files:**

- Modify: `apps/workers/src/do/TopicRoom.ts`
- Modify: `apps/workers/src/tests/TopicRoom.test.ts`

**Steps (TDD):**

1. Add tests for:
   - notify persists `{ seq, payload }`
   - reconnect with `?cursor=` replays in DO emission order
   - malformed `cursor` returns `400` before upgrade
   - inline eviction removes rows older than the retention window
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Add a SQLite `msg_log` table, cursor parsing, and replay logic to
   `TopicRoom`.
4. Run: `pnpm --filter @repo/workers test` — verify PASS.

**Acceptance:**

- [x] `TopicRoom` stores replayable messages in SQLite
- [x] Reconnect with `cursor` replays missed messages in order
- [x] Old replay rows are evicted inline
- [x] Malformed cursors fail before a WebSocket is accepted

---

#### [wire] Task 1.4: Pass `seq` through the queue and DO notify path as a string

**Status:** done

**Depends:** Task 1.3

Make sure the queue / consumer / DO path carries the sequence number needed for
replay without leaking raw `bigint` values into JSON payloads.

**Files:**

- Modify: `apps/workers/src/db/client.ts`
- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/routes/topic.ts`
- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Modify: `apps/workers/src/tests/message.test.ts`
- Modify: `apps/workers/src/tests/topic.test.ts`
- Modify: `apps/workers/src/tests/deliveryConsumer.test.ts`

**Steps (TDD):**

1. Extend `DeliveryPayload` with `seq: string` and update `message.test.ts`
   - `topic.test.ts` to assert the queue payload includes it.
2. Populate `seq` as `String(message.seq)` in both direct-send and
   topic-publish flows.
3. Update `deliveryConsumer.test.ts` to assert the DO notify payload includes
   `seq`, then include that string field in the notify body after successful ack.
4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [x] `seq` flows from Postgres insert → queue payload → DO notify → SQLite log as a lossless decimal string
- [x] Replay logic no longer depends on ad hoc ordering assumptions
- [x] Full targeted tests pass

---

## Verification Gates

| Gate           | Command                                                                                                                     | Success Criteria                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Types          | `pnpm --filter @repo/workers check-types`                                                                                   | Zero errors                                  |
| Lint           | `pnpm --filter @repo/workers lint`                                                                                          | Zero violations                              |
| Tests          | `pnpm --filter @repo/workers test`                                                                                          | All suites green                             |
| Migration      | `DATABASE_URL=postgresql://localhost/test pnpm --filter @repo/workers exec drizzle-kit generate --config drizzle.config.ts` | Command succeeds and writes migration output |
| Deploy dry-run | `pnpm --filter @repo/workers build`                                                                                         | Exit 0                                       |

## Cross-Plan References

| Type     | Blueprint                 | Relationship                                                 |
| -------- | ------------------------- | ------------------------------------------------------------ |
| Upstream | `durable-objects-fan-out` | Extends the same `TopicRoom` DO introduced there             |
| Upstream | `cf-queues-delivery`      | Extends the queue payload and consumer path introduced there |

## Edge Cases and Error Handling

| Edge Case                                             | Risk   | Solution                                                                          | Task |
| ----------------------------------------------------- | ------ | --------------------------------------------------------------------------------- | ---- |
| `cursor` is ahead of the highest stored replay cursor | Low    | Replay query returns no rows; client joins live stream immediately                | 1.3  |
| `cursor` is malformed or non-numeric                  | High   | Reject the upgrade with `400` before a string comparison can produce bad ordering | 1.3  |
| Older messages predate the `seq` migration            | Medium | Roll migration before enabling replay routes broadly                              | 1.2  |
| `seq` exceeds JavaScript's safe integer range         | High   | Keep `bigserial` in Postgres and serialize `seq` as a decimal string on the wire  | 1.4  |
| Replay window is too short for a long disconnect      | Medium | Keep the first implementation intentionally narrow and document the 1-hour window | 1.3  |

## Non-goals

- Long-term archive
- Per-user durable cursor storage across sessions
- D1
- Pipelines

## Risks

| Risk                                              | Impact | Mitigation                                                                                   |
| ------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `seq` could leak across JSON boundaries as bigint | High   | Keep `bigserial` in Postgres, but serialize `seq` as a decimal string in queue / DO payloads |

## Technology Choices

| Component        | Technology                          | Version        | Why                                                                   |
| ---------------- | ----------------------------------- | -------------- | --------------------------------------------------------------------- |
| Ordering truth   | Postgres `bigserial` via Drizzle    | Existing stack | Reuses the durable data plane already present in the repo             |
| Transport format | Decimal string over queue / DO JSON | Repo contract  | Preserves ordering semantics without tripping BigInt JSON limitations |
| Replay cache     | TopicRoom SQLite                    | CF platform    | Co-locates replay with live fan-out and reconnect handling            |
