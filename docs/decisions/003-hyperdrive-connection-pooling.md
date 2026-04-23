---
type: adr
last_updated: "2026-04-22"
---

# ADR 003: Cloudflare Hyperdrive for Postgres connection pooling

**Status:** Accepted

## Context

Cloudflare Workers run in V8 isolates that are garbage-collected after the request completes.
This breaks traditional connection pooling: the isolate that holds a pooled Postgres connection
is destroyed after each request, releasing the connection back to the database — except the
database does not know this happened immediately, leaving a half-open connection until TCP keepalive
times out.

The practical consequence: without a pooler, every Worker request must perform a full TCP + TLS +
Postgres protocol handshake to the database. At typical round-trip times of 20-50ms to a remote
Postgres, this adds 50-200ms to every request — before any query executes.

A secondary concern is connection count. Postgres has a hard connection limit (typically 100 for
shared hosting, up to ~500 for larger instances). With Workers scaling to thousands of concurrent
isolates, unmediated Postgres connections would exhaust the limit immediately.

## Decision

Use Cloudflare Hyperdrive as a connection pooler. Hyperdrive runs a persistent connection pool
at each Cloudflare PoP. Workers connect to the PoP-local pool (fast, within the same datacenter),
which maintains long-lived connections to the origin Postgres.

From the application's perspective, the change is a single line:

```ts
const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
```

The `?? env.DATABASE_URL` fallback allows local development to bypass Hyperdrive entirely and
connect directly to a local Postgres instance.

Source: `apps/workers/src/db/client.ts`

## Consequences

**Positive:**

- Eliminates the per-request TCP + TLS handshake cost. Worker-to-PoP-pool latency is typically
  under 5ms; pool-to-Postgres connection is already established.
- Caps Postgres connection count at the number of connections Hyperdrive maintains per PoP
  (~10-20 by default), regardless of Worker concurrency.
- Hyperdrive caches read-only SELECT query results with automatic invalidation when writes touch
  the same tables. Read-heavy workloads (e.g., queue metadata reads on every publish) benefit
  significantly.

**Negative:**

- **Local development gap.** `wrangler dev` uses `localConnectionString` and bypasses Hyperdrive
  entirely. Query caching behavior is invisible in development. If the application depends on
  cache hits for latency targets, regressions will not appear locally.
- **TLS is mandatory.** Hyperdrive requires TLS 1.2+ to the origin database. Self-signed
  certificates are supported but must be explicitly configured.
- **MySQL prepared statements are unsupported.** The Hyperdrive MySQL proxy does not support
  protocol-level prepared statements. SQL-level `PREPARE`/`EXECUTE` works; driver-level prepared
  statement negotiation does not. This system uses Postgres exclusively, so this limitation
  does not apply here, but matters if the database is ever changed.
- **Extra hop.** Hyperdrive adds one network hop: Worker → PoP pool → Postgres. If the origin
  database already provides HTTP-based access with built-in connection pooling (e.g., Neon's
  serverless HTTP driver), Hyperdrive adds latency without benefit. Neon's HTTP driver was
  evaluated as an alternative.

## Alternatives considered

**Neon serverless HTTP driver:**  
Neon provides an HTTP-based Postgres driver that does not use persistent TCP connections. Each
query is an HTTP POST — no handshake cost, no connection pooling needed. The Neon driver would
solve the V8 isolate lifecycle problem without Hyperdrive.

The trade-off: Neon's HTTP driver requires a Neon-hosted database. This system uses
Drizzle ORM with the standard `postgres` driver, which is database-agnostic. Switching to
Neon's driver would create a runtime dependency on Neon's platform in addition to the database
itself. Rejected: vendor coupling increases; Hyperdrive is database-agnostic.

**PgBouncer (self-hosted):**  
Full-featured pooler with fine-grained control over pool mode (session, transaction, statement).
Requires a persistent VM or container to run, defeating the serverless operational model.
Rejected: operational overhead.
