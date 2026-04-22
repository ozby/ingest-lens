---
type: blueprint
status: planned
complexity: L
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0%"
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

**Goal:** Add a `TopicRoom` Durable Object that acts as the fan-out coordinator
for each topic. Subscribers connect via WebSocket (with hibernation) and receive
messages in real-time as the queue delivery consumer notifies the DO. Eliminates
the MongoDB change-stream fan-out dependency entirely.

## Planning Summary

- **Why now:** There is no real-time push to connected clients today. The only
  delivery path is HTTP push to `pushEndpoint`. Subscribers polling `/api/messages`
  miss messages and hammer the DB. A DO per topic with WebSocket hibernation
  gives push semantics at near-zero idle cost.
- **Scope:** `TopicRoom` DO class with SQLite-backed subscriber tracking and
  WebSocket hibernation. A `/api/topics/:topicId/ws` route in the Worker that
  upgrades to WebSocket and routes to the DO. The delivery consumer (from
  `cf-queues-delivery`) notifies the DO after a successful ack.
- **Out of scope:** Cursor/replay (handled by `message-replay-cursor`).
  Per-subscriber access control beyond topic membership.
  DO-level rate limiting.

## Architecture Overview

```text
Subscriber connects:
  GET /api/topics/:topicId/ws
    → authenticate (JWT)
    → TOPIC_ROOMS.get(topicId).fetch(wsUpgradeRequest)
    → TopicRoom DO accepts WebSocket (hibernation mode)
    → client stays connected; DO sleeps when idle (no billing)

Message published:
  POST /api/messages/:queueId
    → DB insert (unchanged)
    → DELIVERY_QUEUE.send(...)    ← from cf-queues-delivery

Queue consumer (after successful HTTP push ack OR as parallel fan-out):
  → TOPIC_ROOMS.get(topicId).fetch(notifyRequest)
  → TopicRoom DO wakes, broadcasts payload to all connected WebSocket clients
  → DO goes back to sleep
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                                           | Source                                                                                           |
| --- | -------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| F1  | HIGH     | DO SQLite is GA and available on Workers Free plan                                              | CF docs: "SQLite-backed Durable Objects are now available on the Workers Free plan"              |
| F2  | HIGH     | Hibernation keeps WebSocket clients connected while DO is evicted from memory                   | CF docs: "Clients remain connected while the Durable Object is not in memory"                    |
| F3  | HIGH     | New DOs must use `new_sqlite_classes` in `[[migrations]]` for SQLite storage                    | CF docs: "New Durable Object classes should use wrangler configuration for SQLite storage"       |
| F4  | MEDIUM   | Attachment max size via `serializeAttachment` is 2,048 bytes                                    | CF docs: WebSocket hibernation API section                                                       |
| F5  | MEDIUM   | `setTimeout`/`setInterval` inside a DO prevent hibernation                                      | CF docs: "Events such as alarms, incoming requests, and scheduled callbacks prevent hibernation" |
| F6  | LOW      | DO `fetch()` handler is how the Worker communicates with the DO (not RPC) for WebSocket upgrade | CF Workers docs: DO routing                                                                      |

## Key Decisions

| Decision        | Choice                                  | Rationale                                        |
| --------------- | --------------------------------------- | ------------------------------------------------ |
| DO per entity   | Per `topicId`                           | Natural isolation; scales to millions of topics  |
| Storage         | DO SQLite (not KV)                      | Strongly consistent, co-located with compute, GA |
| Fan-out trigger | HTTP `POST /notify` from queue consumer | Simple; decoupled from delivery logic            |
| WebSocket API   | Hibernation API (`acceptWebSocket`)     | Cost-efficient; clients stay connected           |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable                         |
| ----------------- | --------------- | ------------ | -------------------------------------- |
| **Wave 1**        | 1.1, 1.2        | None         | 2 agents (DO class vs wrangler config) |
| **Wave 2**        | 1.3             | 1.1 + 1.2    | 1 agent                                |
| **Wave 3**        | 1.4             | 1.3          | 1 agent                                |
| **Critical path** | 1.1 → 1.3 → 1.4 | —            | 3 waves                                |

---

### Phase 1: TopicRoom DO + wiring [Complexity: L]

#### [do] Task 1.1: `TopicRoom` Durable Object class

**Status:** pending

**Depends:** None

Implement `TopicRoom` with hibernation WebSocket API. Accepts two request
types: `GET /ws` (WebSocket upgrade from subscriber) and `POST /notify`
(fan-out trigger from queue consumer).

**Files:**

- Create: `apps/workers/src/do/TopicRoom.ts`
- Create: `apps/workers/src/tests/TopicRoom.test.ts`

**Steps (TDD):**

1. Write `TopicRoom.test.ts` covering:
   - WebSocket upgrade request → `state.acceptWebSocket(server)` called
   - Notify request with payload → all accepted WebSockets receive JSON message
   - WebSocket close event → socket removed from active set
2. Run: `pnpm --filter @repo/workers test` — FAIL.
3. Implement `TopicRoom.ts`:

   ```ts
   import { DurableObject } from "cloudflare:workers";

   export class TopicRoom extends DurableObject {
     async fetch(request: Request): Promise<Response> {
       const url = new URL(request.url);

       if (url.pathname.endsWith("/ws")) {
         const { 0: client, 1: server } = new WebSocketPair();
         this.ctx.acceptWebSocket(server);
         return new Response(null, { status: 101, webSocket: client });
       }

       if (request.method === "POST" && url.pathname.endsWith("/notify")) {
         const payload = await request.text();
         for (const ws of this.ctx.getWebSockets()) {
           ws.send(payload);
         }
         return new Response("ok");
       }

       return new Response("Not found", { status: 404 });
     }

     webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
       // subscribers are receive-only; echo back for ping/pong keepalive
       if (message === "ping") ws.send("pong");
     }

     webSocketClose(ws: WebSocket): void {
       ws.close();
     }
   }
   ```

4. Run: `pnpm --filter @repo/workers test` — PASS.
5. Run: `pnpm --filter @repo/workers lint` — PASS.

**Acceptance:**

- [ ] `TopicRoom` extends `DurableObject` (from `cloudflare:workers`).
- [ ] WebSocket upgrade handled with `ctx.acceptWebSocket` (hibernation).
- [ ] `/notify` broadcasts to all active sockets.
- [ ] Tests cover upgrade, notify, and close paths.

---

#### [config] Task 1.2: Wrangler DO binding + migration

**Status:** pending

**Depends:** None

Register `TopicRoom` as a Durable Object class with SQLite storage in
`wrangler.toml` and extend the `Env` type.

**Files:**

- Modify: `apps/workers/wrangler.toml`
- Modify: `apps/workers/src/db/client.ts`

**Steps (TDD):**

1. Add to `apps/workers/wrangler.toml`:

   ```toml
   [[durable_objects.bindings]]
   name = "TOPIC_ROOMS"
   class_name = "TopicRoom"

   [[migrations]]
   tag = "v1"
   new_sqlite_classes = ["TopicRoom"]
   ```

2. Add `TOPIC_ROOMS: DurableObjectNamespace` to the `Env` type in
   `apps/workers/src/db/client.ts`.
3. Run: `pnpm --filter @repo/workers check-types` — PASS.

**Acceptance:**

- [ ] `wrangler.toml` has DO binding and migration block using `new_sqlite_classes`.
- [ ] `Env` includes `TOPIC_ROOMS: DurableObjectNamespace`.

---

#### [route] Task 1.3: WebSocket upgrade route

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Add `GET /api/topics/:topicId/ws` to the Hono app that authenticates the
request then proxies the WebSocket upgrade to the appropriate `TopicRoom` DO.

**Files:**

- Modify: `apps/workers/src/routes/topic.ts`
- Create: `apps/workers/src/tests/topicWs.test.ts`

**Steps (TDD):**

1. Write `topicWs.test.ts` verifying the route returns 101 for authenticated
   requests and 401 for unauthenticated ones.
2. Run: `pnpm --filter @repo/workers test` — FAIL.
3. Add to `apps/workers/src/routes/topic.ts`:
   ```ts
   topicRoutes.get("/:topicId/ws", authenticate, async (c) => {
     const topicId = c.req.param("topicId");
     const id = c.env.TOPIC_ROOMS.idFromName(topicId);
     const stub = c.env.TOPIC_ROOMS.get(id);
     return stub.fetch(c.req.raw);
   });
   ```
4. Run: `pnpm --filter @repo/workers test` — PASS.

**Acceptance:**

- [ ] `GET /api/topics/:topicId/ws` returns 101 for authenticated request.
- [ ] Unauthenticated request returns 401 (from `authenticate` middleware).

---

#### [consumer] Task 1.4: Notify DO from delivery consumer

**Status:** pending

**Depends:** Task 1.3

After a successful delivery ack in `deliveryConsumer.ts`, send a `POST /notify`
to the topic's `TopicRoom` DO so connected subscribers receive the message
in real-time.

**Files:**

- Modify: `apps/workers/src/consumers/deliveryConsumer.ts`
- Modify: `apps/workers/src/db/client.ts`
- Modify: `apps/workers/src/tests/deliveryConsumer.test.ts`

**Steps (TDD):**

1. Add `topicId` to `DeliveryPayload` in `db/client.ts`.
2. Update `deliveryConsumer.test.ts` to assert DO notify is called on ack.
3. After `msg.ack()` in the consumer, add:
   ```ts
   const id = env.TOPIC_ROOMS.idFromName(msg.body.topicId);
   const stub = env.TOPIC_ROOMS.get(id);
   await stub.fetch(
     new Request("https://do/notify", {
       method: "POST",
       body: JSON.stringify(msg.body),
     }),
   );
   ```
4. Run: `pnpm --filter @repo/workers test` — PASS.
5. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [ ] DO notify called after every successful delivery ack.
- [ ] `topicId` present in `DeliveryPayload` type.
- [ ] Full test suite green.

---

#### [export] Task 1.5: Export `TopicRoom` class from `index.ts`

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Durable Object classes must be exported from the Worker entry point.

**Files:**

- Modify: `apps/workers/src/index.ts`

**Steps:**

1. Add: `export { TopicRoom } from "./do/TopicRoom";`
2. Run: `pnpm --filter @repo/workers build` — Exit 0.
3. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [ ] `TopicRoom` is a named export from `index.ts`.
- [ ] `pnpm --filter @repo/workers build` passes.

---

## Verification Gates

| Gate           | Command                                   | Success Criteria |
| -------------- | ----------------------------------------- | ---------------- |
| Types          | `pnpm --filter @repo/workers check-types` | Zero errors      |
| Lint           | `pnpm --filter @repo/workers lint`        | Zero violations  |
| Tests          | `pnpm --filter @repo/workers test`        | All suites green |
| Deploy dry-run | `pnpm --filter @repo/workers build`       | Exit 0           |

## Cross-Plan References

| Type       | Blueprint               | Relationship                                                              |
| ---------- | ----------------------- | ------------------------------------------------------------------------- |
| Upstream   | `cf-queues-delivery`    | Delivery consumer (from that blueprint) is modified here to notify the DO |
| Downstream | `message-replay-cursor` | TopicRoom DO SQLite stores per-subscriber cursors for replay              |

## Edge Cases and Error Handling

| Edge Case                                   | Risk   | Solution                                                                                | Task |
| ------------------------------------------- | ------ | --------------------------------------------------------------------------------------- | ---- |
| DO notify fails (network error)             | Medium | Queue consumer already acked; log error but don't retry push — WebSocket is best-effort | 1.4  |
| Subscriber sends non-ping data              | Low    | Server is receive-only; ignore messages that aren't "ping"                              | 1.1  |
| Topic with zero subscribers receives notify | Low    | `getWebSockets()` returns empty array; loop is a no-op                                  | 1.1  |

## Non-goals

- Cursor-based replay on reconnect (handled by `message-replay-cursor`).
- Access control per subscriber beyond topic-level auth.
- DO-level rate limiting on WebSocket connections.

## Risks

| Risk                                                            | Impact | Mitigation                                                |
| --------------------------------------------------------------- | ------ | --------------------------------------------------------- |
| `cloudflare:workers` module not available in vitest environment | Medium | Use `@cloudflare/vitest-pool-workers` for DO unit tests   |
| DO migration tag conflicts if a previous migration exists       | Low    | Use `tag = "v1"` as first migration; increment on changes |

## Technology Choices

| Component             | Technology                  | Version     | Why                                                         |
| --------------------- | --------------------------- | ----------- | ----------------------------------------------------------- |
| Stateful coordination | CF Durable Objects (SQLite) | GA          | Per-topic state, WebSocket hibernation, zero infra          |
| WebSocket API         | DO Hibernation API          | CF platform | Clients stay connected while DO is evicted; no idle billing |
