# node-pubsub

A serverless pub/sub platform built on Cloudflare's edge primitives — exploring where each one's
consistency guarantees break down.

```mermaid
flowchart TD
    subgraph "Path A — Direct queue publish"
        A1([Client]) --> A2["POST /api/messages/:queueId"]
        A2 --> A3[authenticate]
        A3 --> A4{Idempotency-Key\nheader?}
        A4 -->|present| A5[query existing message]
        A5 -->|found| A6[200 — existing message]
        A5 -->|not found| A7["INSERT message\nPostgres via Hyperdrive"]
        A4 -->|absent| A7
        A7 --> A8{pushEndpoint\nconfigured?}
        A8 -->|yes| A9[DELIVERY_QUEUE.send]
        A8 -->|no| A10[201 Created]
        A9 --> A10
    end

    subgraph "Path B — Topic fan-out"
        B1([Client]) --> B2["POST /api/topics/:topicId/publish"]
        B2 --> B3[authenticate]
        B3 --> B4[find topic + subscribed queues]
        B4 --> B5["for each queue:\nINSERT message + DELIVERY_QUEUE.send"]
        B5 --> B6[201 Created]
    end

    subgraph "Delivery consumer"
        C1[DELIVERY_QUEUE batch] --> C2[fetch DB row]
        C2 -->|missing| C3["msg.ack() — safe drop"]
        C2 -->|found| C4["POST pushEndpoint"]
        C4 -->|2xx| C5["msg.ack()"]
        C4 -->|5xx / error| C6["msg.retry(backoff)\n[5, 10, 20, 40, 80]s"]
        C6 -->|after 5 retries| C7[delivery-dlq]
        C5 --> C8{"topicId present?\n(planned)"}
        C8 -->|yes| C9["TOPIC_ROOMS.get(topicId)\n.fetch('/notify')"]
    end

    A9 -.->|enqueue| C1
    B5 -.->|enqueue| C1
```

## Key design decisions

| Decision      | Choice                       | Trade-off                                                                                                                   |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Runtime       | Cloudflare Workers           | No idle cost, 30s CPU limit — [ADR 001](docs/decisions/001-cloudflare-workers-runtime.md)                                   |
| Delivery      | Cloudflare Queues            | At-least-once, ack/retry built-in — [ADR 002](docs/decisions/002-cloudflare-queues-delivery.md)                             |
| Database      | Postgres via Hyperdrive      | PoP-level connection pooling solves V8 isolate TCP problem — [ADR 003](docs/decisions/003-hyperdrive-connection-pooling.md) |
| Rate limiting | CF Workers binding (per-PoP) | Sub-ms decisions, not a global quota system — [ADR 004](docs/decisions/004-per-pop-rate-limiting.md)                        |
| Real-time     | Durable Objects fan-out      | Actor model, single-writer, hibernation economics — [ADR 005](docs/decisions/005-durable-objects-fan-out.md)                |

## Quick start

```bash
pnpm install
pnpm --filter @repo/workers dev     # wrangler dev (local Postgres via DATABASE_URL)
pnpm --filter @repo/workers test    # vitest
pnpm --filter @repo/workers check-types  # tsgo --noEmit
```

## Docs

- [Architecture](docs/architecture.md) — system design walk-through
- [Delivery guarantees](docs/delivery-guarantees.md) — at-least-once contract, idempotency keys, backoff, DLQ
- [Scale considerations](docs/scale-considerations.md) — where it breaks and what to do about it
- [Decisions](docs/decisions/) — architecture decision records

## API reference

| Method | Path                             | Auth   | Description                                        |
| ------ | -------------------------------- | ------ | -------------------------------------------------- |
| POST   | `/api/auth/register`             | —      | Create user account                                |
| POST   | `/api/auth/login`                | —      | Authenticate, receive JWT                          |
| GET    | `/api/auth/me`                   | Bearer | Current user                                       |
| POST   | `/api/queues`                    | Bearer | Create queue (optional `pushEndpoint`)             |
| GET    | `/api/queues`                    | Bearer | List owned queues                                  |
| GET    | `/api/queues/:id`                | Bearer | Get queue                                          |
| DELETE | `/api/queues/:id`                | Bearer | Delete queue                                       |
| POST   | `/api/messages/:queueId`         | Bearer | Publish message; supports `Idempotency-Key` header |
| POST   | `/api/topics`                    | Bearer | Create topic                                       |
| GET    | `/api/topics`                    | Bearer | List owned topics                                  |
| POST   | `/api/topics/:topicId/subscribe` | Bearer | Subscribe a queue to a topic                       |
| POST   | `/api/topics/:topicId/publish`   | Bearer | Fan-out publish to all subscribed queues           |
| GET    | `/api/topics/:topicId/ws`        | Bearer | WebSocket upgrade — planned                        |
| GET    | `/api/dashboard`                 | Bearer | Server and queue metrics                           |
| GET    | `/health`                        | —      | Health check                                       |

## Stack

| Layer              | Technology                                               |
| ------------------ | -------------------------------------------------------- |
| Runtime            | Cloudflare Workers (Hono)                                |
| Database           | Postgres + Drizzle ORM, pooled via Cloudflare Hyperdrive |
| Async delivery     | Cloudflare Queues                                        |
| Real-time fan-out  | Cloudflare Durable Objects — planned                     |
| Rate limiting      | Cloudflare Rate Limiting binding — planned               |
| Delivery telemetry | Cloudflare Analytics Engine — planned                    |
| Test runner        | Vitest                                                   |
| Type checker       | `tsgo` (`@typescript/native-preview`)                    |
| Secrets            | Doppler — no `.env` files                                |

## Roadmap

Feature work is tracked as self-contained blueprints in [`blueprints/`](./blueprints/).
Each blueprint has an explicit dependency graph, TDD steps, and verification gates.

| Blueprint                                                            | Status    |
| -------------------------------------------------------------------- | --------- |
| `workers-hono-port` — hard-cut Express → Hono on CF Workers          | completed |
| `cf-queues-delivery` — Cloudflare Queues consumer with ack/retry     | completed |
| `cf-rate-limiting` — per-PoP rate limiting on authenticated routes   | planned   |
| `analytics-engine-telemetry` — delivery metrics via Analytics Engine | planned   |
| `durable-objects-fan-out` — WebSocket fan-out via TopicRoom DO       | planned   |
| `message-replay-cursor` — durable replay cursor on TopicRoom DO      | planned   |
