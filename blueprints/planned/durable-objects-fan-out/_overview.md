---
type: blueprint
status: planned
complexity: L
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0% (refined)"
depends_on:
  - cf-queues-delivery
tags:
  - cloudflare-workers
  - durable-objects
  - websocket
  - real-time
  - fan-out
---

# Durable Objects fan-out

**Goal:** Add a `TopicRoom` Durable Object per topic so authenticated clients
can subscribe over WebSockets and receive real-time topic fan-out with
hibernation.

## Planning Summary

- **Why now:** The repo has no push path for connected browser clients. Topic
  subscribers either poll or depend on out-of-band delivery.
- **Scope:** One SQLite-backed Durable Object class, one Worker route for
  WebSocket upgrades, and one consumer-side notify call for topic deliveries.
- **Out of scope:** Replay cursors, strict quota enforcement, and long-lived
  browser auth/session state beyond the current JWT gate.

## Refinement Summary

- Removed the stale “eliminate MongoDB change-stream dependency entirely” claim.
  The blueprint now focuses on the Worker-native real-time path it actually
  adds.
- Tightened notify semantics so the consumer only calls the DO when a delivery
  payload has a `topicId`.
- Added a route-order note: `/:topicId/ws` must be registered **before** the
  generic `/:id` route in `routes/topic.ts`.
- Removed the assumption that a new test dependency is required. Use plain
  Vitest with lightweight stubs for the DO state surface.

## Pre-execution audit (2026-04-22)

**Readiness:** blocked-by-upstream

**What is already true**

- `apps/workers/src/routes/topic.ts` is the correct router for a topic WebSocket
  endpoint.
- `@cloudflare/workers-types` in the current workspace already exposes Durable
  Object namespace types.
- The blueprint correctly depends on `cf-queues-delivery`, which is the future
  notify chokepoint.

**Blocking gaps**

- The queue consumer that should notify the DO does not exist yet.
- `topicRoutes` currently has a generic `GET /:id` matcher before any WebSocket
  route, so route order must be corrected during implementation.
- The Vitest environment is `node`, not a Workers runtime. DO behavior will
  need stub-based tests first and build validation second.

**First-build notes**

- Do not add an extra route-level `authenticate` call on the WebSocket route;
  `topicRoutes.use("*", authenticate)` already covers the router.
- Only notify the DO for queue payloads that carry a non-null `topicId`.
- Keep the first version focused on best-effort live fan-out, not replay.

## Architecture Overview

```text
browser client
  → GET /api/topics/:topicId/ws
  → authenticate
  → TOPIC_ROOMS.idFromName(topicId)
  → TopicRoom accepts WebSocket via hibernation API

queue consumer
  → successful delivery for payload with topicId
  → TOPIC_ROOMS.get(topicId).fetch(POST /notify)
  → TopicRoom broadcasts JSON payload to connected sockets
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                                    | Source                                    |
| --- | -------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| F1  | HIGH     | Cloudflare recommends SQLite-backed Durable Objects for new namespaces.                  | Durable Objects docs, fetched 2026-04-22. |
| F2  | HIGH     | Durable Objects support WebSocket hibernation for long-lived connections.                | Durable Objects docs, fetched 2026-04-22. |
| F3  | HIGH     | New SQLite-backed DO classes are declared with `new_sqlite_classes` in `[[migrations]]`. | Durable Objects docs, fetched 2026-04-22. |
| F4  | MEDIUM   | DOs are the right coordination primitive for per-topic real-time state.                  | Research synthesis, 2026-04-22.           |

## Key Decisions

| Decision           | Choice                                                               | Rationale                                                 |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Object cardinality | One `TopicRoom` per `topicId`                                        | Natural sharding and fault isolation                      |
| Notify transport   | `stub.fetch(new Request("https://topic-room.internal/notify", ...))` | Simple and available without introducing Service Bindings |
| Fan-out payload    | JSON body with message metadata + data needed by clients             | Avoid extra browser round-trips for the live path         |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable |
| ----------------- | --------------- | ------------ | -------------- |
| **Wave 1**        | 1.1, 1.2        | None         | 2 agents       |
| **Wave 2**        | 1.3             | 1.1 + 1.2    | 1 agent        |
| **Wave 3**        | 1.4, 1.5        | 1.3          | 2 agents       |
| **Critical path** | 1.1 → 1.3 → 1.5 | —            | 3 waves        |

---

### Phase 1: TopicRoom DO, route, and consumer notify [Complexity: L]

#### [do] Task 1.1: Implement `TopicRoom`

**Status:** pending

**Depends:** None

Create the Durable Object class that accepts WebSocket upgrades and broadcasts
notify payloads to connected sockets.

**Files:**

- Create: `apps/workers/src/do/TopicRoom.ts`
- Create: `apps/workers/src/tests/TopicRoom.test.ts`

**Steps (TDD):**

1. Write tests using plain Vitest stubs for `acceptWebSocket()`,
   `getWebSockets()`, and socket `send()` calls.
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Implement `TopicRoom` with:
   - `GET /ws` → WebSocket upgrade + `acceptWebSocket(server)`
   - `POST /notify` → broadcast payload to `ctx.getWebSockets()`
   - receive-only client behavior with optional `ping` / `pong`
4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint` — verify PASS.

**Acceptance:**

- [ ] `TopicRoom` handles `/ws` and `/notify`
- [ ] Broadcast logic is covered by tests using lightweight stubs
- [ ] No new test dependency is introduced

---

#### [config] Task 1.2: Add DO binding + SQLite migration

**Status:** pending

**Depends:** None

Register the DO class in `wrangler.toml` and extend the Worker `Env` type.

**Files:**

- Modify: `apps/workers/wrangler.toml`
- Modify: `apps/workers/src/db/client.ts`

**Steps (TDD):**

1. Add:

   ```toml
   [[durable_objects.bindings]]
   name = "TOPIC_ROOMS"
   class_name = "TopicRoom"

   [[migrations]]
   tag = "topic-room-v1"
   new_sqlite_classes = ["TopicRoom"]
   ```

2. Add `TOPIC_ROOMS: DurableObjectNamespace` to the `Env` type.
3. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] `wrangler.toml` declares `TOPIC_ROOMS`
- [ ] Migration uses `new_sqlite_classes`
- [ ] `Env` includes `TOPIC_ROOMS: DurableObjectNamespace`

---

#### [route] Task 1.3: Add the WebSocket upgrade route

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Add `GET /api/topics/:topicId/ws` and place it before the generic `/:id`
matcher in `routes/topic.ts`.

**Files:**

- Modify: `apps/workers/src/routes/topic.ts`
- Create: `apps/workers/src/tests/topicWs.test.ts`

**Steps (TDD):**

1. Write `topicWs.test.ts` verifying the route shape and auth gate.
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Insert the route before `topicRoutes.get("/:id", ...)` and proxy the raw
   upgrade request to the DO stub.
4. Run: `pnpm --filter @repo/workers test` — verify PASS.

**Acceptance:**

- [ ] `/:topicId/ws` is registered before `/:id`
- [ ] Authenticated requests reach the DO stub
- [ ] Unauthenticated requests still fail at the auth layer

---

#### [consumer] Task 1.4: Notify the DO from the queue consumer

**Status:** pending

**Depends:** Task 1.3

On successful delivery ack, notify the topic DO **only when** the queue payload
contains a `topicId`.

**Files:**

- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Modify: `apps/workers/src/tests/deliveryConsumer.test.ts`

**Steps (TDD):**

1. Add tests asserting:
   - ack + `topicId` → DO notify happens
   - ack + `topicId = null` → no DO notify
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. After successful ack, call `env.TOPIC_ROOMS.get(id).fetch(...)` with the
   broadcast payload.
4. Run: `pnpm --filter @repo/workers test` — verify PASS.

**Acceptance:**

- [ ] DO notify is conditional on `topicId`
- [ ] Direct queue sends do not trigger topic fan-out accidentally
- [ ] Tests cover both branches

---

#### [export] Task 1.5: Export the DO class from the Worker entry point

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Export `TopicRoom` from `apps/workers/src/index.ts` while preserving the Worker
entry point shape required by `cf-queues-delivery`.

**Files:**

- Modify: `apps/workers/src/index.ts`

**Steps (TDD):**

1. Add `export { TopicRoom } from "./do/TopicRoom";`
2. Keep the default export compatible with `{ fetch, queue }` from the queues
   blueprint.
3. Run: `pnpm --filter @repo/workers build` — verify PASS.
4. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] `TopicRoom` is exported from `index.ts`
- [ ] The Worker still builds with both `fetch` and `queue` handlers present

---

## Verification Gates

| Gate           | Command                                   | Success Criteria |
| -------------- | ----------------------------------------- | ---------------- |
| Types          | `pnpm --filter @repo/workers check-types` | Zero errors      |
| Lint           | `pnpm --filter @repo/workers lint`        | Zero violations  |
| Tests          | `pnpm --filter @repo/workers test`        | All suites green |
| Deploy dry-run | `pnpm --filter @repo/workers build`       | Exit 0           |

## Cross-Plan References

| Type       | Blueprint               | Relationship                                              |
| ---------- | ----------------------- | --------------------------------------------------------- |
| Upstream   | `cf-queues-delivery`    | Uses the queue payload and consumer introduced there      |
| Downstream | `message-replay-cursor` | Extends the same `TopicRoom` DO with durable replay state |

## Edge Cases and Error Handling

| Edge Case                                         | Risk   | Solution                                                                                         | Task |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ | ---- |
| No clients are connected                          | Low    | Broadcasting over an empty socket list is a no-op                                                | 1.1  |
| DO notify fails after the HTTP push ack succeeded | Medium | Treat realtime fan-out as best-effort and log locally rather than retrying the external delivery | 1.4  |
| Generic `/:id` route captures `/ws` traffic       | High   | Register the WebSocket route before the generic lookup route                                     | 1.3  |

## Non-goals

- Cursor replay
- Strict quota enforcement
- Replacing auth/session storage

## Risks

| Risk                                             | Impact | Mitigation                                                                                  |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| Worker-side DO tests are brittle in plain Vitest | Medium | Keep most logic testable with simple stubs and let `build` validate the entrypoint contract |

## Technology Choices

| Component             | Technology                          | Version     | Why                                                               |
| --------------------- | ----------------------------------- | ----------- | ----------------------------------------------------------------- |
| Realtime coordination | Cloudflare Durable Objects (SQLite) | CF platform | Natural fit for per-topic state and hibernating WebSocket fan-out |
