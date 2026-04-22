# ADR 004: Cloudflare Workers Rate Limiting binding (per-PoP)

**Status:** Accepted — with documented limitations

## Context

The authenticated API surface is unbounded by default. A buggy client or a determined attacker
can issue unlimited requests per second. Without rate limiting, a single misbehaving client can
exhaust Hyperdrive connection pool slots or saturate the queue consumer.

The system needs rate limiting on authenticated routes. Two options are meaningful:

1. **Cloudflare Workers Rate Limiting binding** — enforced per-PoP at the edge, sub-millisecond
   decision latency, configured as a `[[ratelimits]]` binding in `wrangler.toml`.

2. **Durable Object-backed global rate limiter** — enforced globally via a single DO instance
   per user, strongly consistent, but adds 10-50ms to every request (round-trip to the DO).

## Decision

Use the Cloudflare Workers Rate Limiting binding with `100 requests / 60 seconds` per user ID.
Mount the middleware on authenticated routers (`queueRoutes`, `messageRoutes`, `topicRoutes`,
`dashboardRoutes`) after `authenticate` runs, so the limiter key is always a resolved user ID.

Do not mount the limiter globally on `index.ts` or on `/health` / `/api/auth/*` endpoints.

## Consequences

**Positive:**

- Decision latency under 1ms. The rate limit check does not add a network hop.
- Simple binding configuration — no additional infrastructure.
- Effective at preventing a buggy client from hammering the API from a single location.

**Negative, and important:**

- **This is per-PoP, not global.** The 100 req/min limit is enforced independently at each of
  Cloudflare's 300+ PoPs. A geographically distributed client can make
  `300 PoPs × 100 req/min = 30,000 req/min globally (500 req/sec)` while appearing to comply
  at every individual location.

- **This is DDoS protection, not quota enforcement.** The distinction matters. Per-PoP rate
  limiting is appropriate for protecting individual PoPs from local saturation. It is not
  appropriate for enforcing per-user product quotas (e.g., "this tier may send at most 1,000
  messages per hour globally").

- **Window granularity is fixed.** Cloudflare's rate limiting binding supports only 10-second
  or 60-second windows. No sliding window. No per-hour or per-day accounting.

## For global quota enforcement: use a Durable Object

A Durable Object with SQLite storage can implement a correct global sliding window rate limiter.
The DO has global uniqueness — there is exactly one instance per user ID across all PoPs. Every
check is serialized through the same single-threaded writer:

```ts
// Inside a RateLimiter DO
async check(userId: string, limit: number, windowSecs: number): Promise<boolean> {
  const now = Date.now();
  const window = now - windowSecs * 1000;
  const count = this.ctx.storage.sql
    .exec(`SELECT COUNT(*) as n FROM hits WHERE user_id = ? AND ts > ?`, userId, window)
    .one().n;
  if (count >= limit) return false;
  this.ctx.storage.sql.exec(`INSERT INTO hits VALUES (?, ?)`, userId, now);
  return true;
}
```

Trade-offs of the DO approach:

- **Correct** — globally enforced, strongly consistent.
- **10-50ms added latency** — every authenticated request makes a subrequest to the DO.
- **Single-writer bottleneck** — one DO handles all checks for one user. At >100 req/sec per
  user, the DO becomes the bottleneck.
- **Cold start** — a hibernated DO adds ~100ms to the first request after a quiet period.

The DO approach is the right call for a product that charges by usage (metered billing). It is
over-engineered for the current use case (protecting an unbounded API surface).

## Alternatives considered

**WAF Rate Limiting Rules (Cloudflare dashboard):**  
Aggregates globally across all PoPs with ~1-5 second eventual consistency lag. Correct for DDoS
mitigation where second-level accuracy is acceptable. Not configurable from application code —
requires dashboard or Terraform changes to modify limits. Rejected for this use case: the rate
limit key should be the authenticated `userId`, which is only known after the JWT is verified in
the Worker, not at the WAF layer.

**Upstash Redis with sliding window scripts:**  
Globally consistent, atomic Lua script on each check. Adds ~50-100ms round-trip latency to a
remote Redis instance. Introduces an external dependency outside Cloudflare's network.
Rejected: latency cost and external dependency are both higher than the DO alternative.
