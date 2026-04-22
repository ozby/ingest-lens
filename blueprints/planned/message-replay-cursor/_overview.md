---
type: blueprint
status: planned
complexity: M
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0%"
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

**Goal:** Add sequence numbers to messages and per-subscriber cursor tracking
in the `TopicRoom` Durable Object so that subscribers can resume from a cursor
on reconnect and receive all missed messages — Kafka-style offset semantics
without Kafka.

## Planning Summary

- **Why now:** Currently, if a subscriber disconnects and reconnects, all
  messages published during the gap are lost. With `durable-objects-fan-out`
  landing first, the DO is the natural place to hold cursor state and replay.
- **Scope:** Add a `seq` BIGINT column to the `messages` Postgres table.
  Store each message payload in DO SQLite keyed by `seq`. On WebSocket
  connect with `?cursor=<n>`, replay messages from `n+1` before joining
  the live stream. Evict messages older than a configurable retention window
  from DO SQLite.
- **Out of scope:** Full event log (R2/Pipelines for long-term storage is a
  separate concern). Per-subscriber persistent cursors across browser sessions
  (that needs auth-scoped storage). Global offset compaction.

## Architecture Overview

```text
Message published → seq assigned (Postgres sequence) → stored in DO SQLite

Subscriber reconnects:
  GET /api/topics/:topicId/ws?cursor=42
    → TopicRoom DO queries SQLite: SELECT * FROM msg_log WHERE seq > 42
    → Sends missed messages over WebSocket (ordered by seq)
    → Joins live stream (receives new messages as they arrive)

DO SQLite message log:
  msg_log(seq INTEGER PRIMARY KEY, payload TEXT, created_at INTEGER)
  Eviction: DELETE FROM msg_log WHERE created_at < unixepoch() - 3600
            (run on each notify, KISS — no separate alarm)
```

## Fact-Checked Findings

| ID  | Severity | Claim                                              | Source                                                                                                                     |
| --- | -------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F1  | HIGH     | DO SQLite has `sql.exec` for arbitrary SQL (GA)    | CF docs: "SQLite storage and corresponding Storage API methods like sql.exec have moved from beta to general availability" |
| F2  | HIGH     | Postgres supports `BIGSERIAL` / sequences natively | Postgres docs; Drizzle `bigserial` type                                                                                    |
| F3  | MEDIUM   | DO SQLite storage persists across hibernation      | CF docs: DO SQLite storage is durable                                                                                      |
| F4  | LOW      | Drizzle `bigserial` maps to `bigint` in TypeScript | Drizzle pg-core docs                                                                                                       |

## Key Decisions

| Decision          | Choice                                 | Rationale                                                            |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Sequence source   | Postgres `BIGSERIAL` on `messages.seq` | Single source of truth; avoids distributed sequence coordination     |
| Cursor storage    | DO SQLite `msg_log` table              | Co-located with fan-out; fast replay without DB round-trip           |
| Replay window     | 1 hour of messages in DO SQLite        | KISS: covers transient disconnects; long-term replay is out of scope |
| Eviction strategy | Delete on each notify (inline)         | No alarm needed; KISS                                                |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable                   |
| ----------------- | --------- | ------------ | -------------------------------- |
| **Wave 1**        | 1.1, 1.2  | None         | 2 agents (DB schema vs DO logic) |
| **Wave 2**        | 1.3       | 1.1 + 1.2    | 1 agent                          |
| **Critical path** | 1.1 → 1.3 | —            | 2 waves                          |

---

### Phase 1: Sequence, DO log, and cursor replay [Complexity: M]

#### [db] Task 1.1: Add `seq` to `messages` schema

**Status:** pending

**Depends:** None

Add a `seq` `BIGSERIAL` column to the `messages` Drizzle schema and generate
the migration.

**Files:**

- Modify: `apps/workers/src/db/schema.ts`

**Steps (TDD):**

1. Add to the `messages` table in `apps/workers/src/db/schema.ts`:
   ```ts
   import { bigserial } from "drizzle-orm/pg-core";
   // inside messages pgTable:
   seq: bigserial("seq", { mode: "bigint" }).notNull(),
   ```
2. Run: `pnpm --filter @repo/workers exec drizzle-kit generate` — produces a
   migration adding `seq BIGSERIAL NOT NULL` with a unique constraint.
3. Run: `pnpm --filter @repo/workers check-types` — PASS.

**Acceptance:**

- [ ] `messages` schema has `seq: bigserial(…)`.
- [ ] Migration file generated in `apps/workers/src/db/migrations/`.
- [ ] `pnpm --filter @repo/workers check-types` passes.

---

#### [do] Task 1.2: `TopicRoom` message log + cursor replay

**Status:** pending

**Depends:** None (modifies `TopicRoom.ts` from `durable-objects-fan-out`)

Extend `TopicRoom` to:

1. Persist each notified message to DO SQLite `msg_log`.
2. On WebSocket upgrade with `?cursor=<n>`, replay msgs with `seq > n`.
3. Evict messages older than 1 hour on each notify.

**Files:**

- Modify: `apps/workers/src/do/TopicRoom.ts`
- Modify: `apps/workers/src/tests/TopicRoom.test.ts`

**Steps (TDD):**

1. Add test cases to `TopicRoom.test.ts`:
   - Notify with `seq=5` → msg stored in SQLite
   - WS connect with `cursor=3` → messages 4 and 5 sent before live stream
   - Eviction: messages older than 3600 s deleted on notify
2. Run: `pnpm --filter @repo/workers test` — FAIL.
3. In `TopicRoom.ts`, initialise SQLite table in the constructor:
   ```ts
   constructor(ctx: DurableObjectState, env: Env) {
     super(ctx, env);
     this.ctx.storage.sql.exec(`
       CREATE TABLE IF NOT EXISTS msg_log (
         seq INTEGER PRIMARY KEY,
         payload TEXT NOT NULL,
         created_at INTEGER NOT NULL DEFAULT (unixepoch())
       )
     `);
   }
   ```
4. In the `/notify` handler, before broadcasting:
   ```ts
   const { seq, ...rest } = payload;
   this.ctx.storage.sql.exec(
     "INSERT OR IGNORE INTO msg_log (seq, payload) VALUES (?, ?)",
     seq,
     JSON.stringify(rest),
   );
   // evict messages older than 1 hour
   this.ctx.storage.sql.exec("DELETE FROM msg_log WHERE created_at < unixepoch() - 3600");
   ```
5. In the `/ws` handler, read `cursor` from URL query params:
   ```ts
   const cursor = Number(url.searchParams.get("cursor") ?? "0");
   const rows = [
     ...this.ctx.storage.sql.exec(
       "SELECT seq, payload FROM msg_log WHERE seq > ? ORDER BY seq",
       cursor,
     ),
   ];
   this.ctx.acceptWebSocket(server);
   // replay missed messages synchronously before hibernation
   for (const row of rows) {
     server.send(row.payload as string);
   }
   ```
6. Run: `pnpm --filter @repo/workers test` — PASS.

**Acceptance:**

- [ ] Notify persists message to DO SQLite.
- [ ] WS connect with cursor replays missed messages in seq order.
- [ ] Eviction runs on every notify call.
- [ ] Tests pass.

---

#### [wire] Task 1.3: Pass `seq` through delivery consumer

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Include `seq` in the DO notify payload so `TopicRoom` can log it.

**Files:**

- Modify: `apps/workers/src/db/client.ts`
- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Modify: `apps/workers/src/routes/message.ts`

**Steps (TDD):**

1. Add `seq: bigint` to `DeliveryPayload` in `db/client.ts`.
2. In `message.ts` publish route, include `seq: message.seq` in the
   `DELIVERY_QUEUE.send(…)` call.
3. In `deliveryConsumer.ts`, pass `seq` in the DO notify body.
4. Run: `pnpm --filter @repo/workers test` — PASS.
5. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [ ] `DeliveryPayload` has `seq: bigint`.
- [ ] `seq` flows from DB insert → queue payload → DO notify → SQLite log.
- [ ] Full test suite green.

---

## Verification Gates

| Gate           | Command                                                 | Success Criteria           |
| -------------- | ------------------------------------------------------- | -------------------------- |
| Types          | `pnpm --filter @repo/workers check-types`               | Zero errors                |
| Lint           | `pnpm --filter @repo/workers lint`                      | Zero violations            |
| Tests          | `pnpm --filter @repo/workers test`                      | All suites green           |
| Migration      | `pnpm --filter @repo/workers exec drizzle-kit generate` | New migration file present |
| Deploy dry-run | `pnpm --filter @repo/workers build`                     | Exit 0                     |

## Cross-Plan References

| Type     | Blueprint                 | Relationship                                         |
| -------- | ------------------------- | ---------------------------------------------------- |
| Upstream | `durable-objects-fan-out` | TopicRoom DO and delivery consumer are extended here |
| Upstream | `cf-queues-delivery`      | `DeliveryPayload` type extended with `seq` field     |

## Edge Cases and Error Handling

| Edge Case                                       | Risk   | Solution                                                                | Task |
| ----------------------------------------------- | ------ | ----------------------------------------------------------------------- | ---- |
| `cursor` larger than max seq in log             | Low    | `seq > cursor` returns empty set; subscriber gets live stream only      | 1.2  |
| `seq` absent on old messages (before migration) | Medium | `seq` column is `NOT NULL`; old rows get seq from the BIGSERIAL default | 1.1  |
| DO SQLite grows unbounded between notifies      | Low    | Eviction runs on every notify; 1 h window is bounded                    | 1.2  |

## Non-goals

- Long-term event archive (use Pipelines → R2 for that).
- Per-subscriber persistent cursor across sessions (needs auth-scoped storage, separate blueprint).
- Exactly-once delivery (at-least-once from Queues is sufficient; replay handles the gap).

## Risks

| Risk                                                              | Impact | Mitigation                                                             |
| ----------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `bigserial` type not supported in current Drizzle version         | Medium | Drizzle ^0.33 supports `bigserial` in pg-core; verify in `check-types` |
| DO SQLite `sql.exec` API differs between miniflare and production | Medium | Use `@cloudflare/vitest-pool-workers` for accurate DO tests            |

## Technology Choices

| Component    | Technology           | Version | Why                                          |
| ------------ | -------------------- | ------- | -------------------------------------------- |
| Sequence     | Postgres `BIGSERIAL` | —       | Monotonic, durable, existing DB              |
| Cursor store | DO SQLite            | GA      | Co-located with fan-out, no extra round-trip |
