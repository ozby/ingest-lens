---
type: blueprint
status: planned
complexity: XS
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0%"
depends_on: []
tags:
  - cloudflare-workers
  - rate-limiting
  - security
---

# CF Rate Limiting binding

**Goal:** Add Cloudflare's native Rate Limiting binding to `apps/workers` to
protect every authenticated endpoint at the edge, replacing the absent
server-side protection that was removed when `apps/api-server` (which had
`express-rate-limit`) was hard-cut.

## Planning Summary

- **Why now:** No rate limiting exists anywhere in the Workers runtime today.
  Any authenticated endpoint is currently unbounded.
- **Scope:** One `[[ratelimits]]` binding in `wrangler.toml`; one Hono
  middleware that calls `env.RATE_LIMITER.limit({ key })` keyed on the
  authenticated `userId`; applied globally after auth middleware.
- **Out of scope:** Per-plan tier limits (free vs paid). Per-route overrides.
  True sliding-window precision (the CF binding is token-bucket with 10 s or
  60 s windows — sufficient for v1).

## Architecture Overview

```text
before:
  POST /api/messages/:queueId  →  authenticate  →  handler  (unbounded)

after:
  POST /api/messages/:queueId  →  authenticate  →  rateLimiter  →  handler
  (100 req / 60 s per userId at the CF edge, shared across all Worker instances)
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                | Source                                                                       |
| --- | -------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F1  | HIGH     | CF Rate Limiting binding uses token bucket, NOT true sliding window  | CF docs: `simple.period` must be `10` or `60` seconds                        |
| F2  | HIGH     | Two bindings sharing the same `namespace_id` share counters globally | CF docs: "allows you to enforce a single rate limit across multiple Workers" |
| F3  | LOW      | CF PubSub (MQTT) product — 404 as of 2026-04-22                      | Verified: endpoint returns 404; use Queues + DO WebSockets instead           |

## Key Decisions

| Decision            | Choice               | Rationale                                                        |
| ------------------- | -------------------- | ---------------------------------------------------------------- |
| Key granularity     | `userId` (from JWT)  | Per-user fairness; IP is unreliable behind CF proxy              |
| Window              | 60 s, 100 req        | Conservative start; can relax without code changes               |
| Middleware position | After `authenticate` | `userId` is only available post-auth; pre-auth has no useful key |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable             |
| ----------------- | --------- | ------------ | -------------------------- |
| **Wave 1**        | 1.1, 1.2  | None         | 2 agents (different files) |
| **Wave 2**        | 1.3       | 1.1 + 1.2    | 1 agent                    |
| **Critical path** | 1.1 → 1.3 | —            | 2 waves                    |

---

### Phase 1: Add binding, middleware, and tests [Complexity: XS]

#### [config] Task 1.1: Wrangler binding + Env type

**Status:** pending

**Depends:** None

Add `[[ratelimits]]` block to `apps/workers/wrangler.toml` and extend the
`Env` type in `apps/workers/src/db/client.ts` with `RATE_LIMITER: RateLimit`.

**Files:**

- Modify: `apps/workers/wrangler.toml`
- Modify: `apps/workers/src/db/client.ts`

**Steps (TDD):**

1. Add to `apps/workers/wrangler.toml`:
   ```toml
   [[ratelimits]]
   name = "RATE_LIMITER"
   namespace_id = "1001"
   [ratelimits.simple]
   limit = 100
   period = 60
   ```
2. Add `RATE_LIMITER: RateLimit` to the `Env` type in `src/db/client.ts`.
3. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] `wrangler.toml` contains a `[[ratelimits]]` block with `limit = 100` and `period = 60`.
- [ ] `Env` type includes `RATE_LIMITER: RateLimit`.
- [ ] `pnpm --filter @repo/workers check-types` passes.

---

#### [middleware] Task 1.2: `rateLimiter` middleware

**Status:** pending

**Depends:** None

Create a Hono middleware that calls `env.RATE_LIMITER.limit({ key: userId })`
and returns 429 with a `Retry-After: 60` header on failure.

**Files:**

- Create: `apps/workers/src/middleware/rateLimiter.ts`
- Create: `apps/workers/src/tests/rateLimiter.test.ts`

**Steps (TDD):**

1. Write `rateLimiter.test.ts` with two cases: allowed request passes through;
   blocked request returns 429 with `Retry-After` header.
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Implement `rateLimiter.ts`:

   ```ts
   import { createMiddleware } from "hono/factory";
   import type { Env } from "../db/client";

   export const rateLimiter = createMiddleware<{ Bindings: Env }>(async (c, next) => {
     const user = c.get("user") as { userId: string } | undefined;
     const key = user?.userId ?? c.req.header("cf-connecting-ip") ?? "anon";
     const { success } = await c.env.RATE_LIMITER.limit({ key });
     if (!success) {
       return c.json({ status: "error", message: "Rate limit exceeded" }, 429, {
         "Retry-After": "60",
       });
     }
     await next();
   });
   ```

4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint` — verify PASS.

**Acceptance:**

- [ ] Tests cover allowed + blocked cases.
- [ ] Blocked response is 429 with `Retry-After: 60` header.
- [ ] `pnpm --filter @repo/workers test` green.

---

#### [wire] Task 1.3: Mount middleware in `index.ts`

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Apply `rateLimiter` globally after `authenticate` is already applied per-route.
Since authenticate is route-level, apply `rateLimiter` as a global middleware
that falls through gracefully when no user is set (pre-auth paths like `/health`
and `/api/auth` are not rate-limited by user key — they fall back to IP key).

**Files:**

- Modify: `apps/workers/src/index.ts`

**Steps (TDD):**

1. Import `rateLimiter` and register it after the existing global middlewares:
   ```ts
   app.use("*", rateLimiter);
   ```
2. Run: `pnpm --filter @repo/workers test` — full suite must stay green.
3. Run: `pnpm --filter @repo/workers check-types` — zero errors.

**Acceptance:**

- [ ] `rateLimiter` registered in `index.ts`.
- [ ] All existing tests still pass.

---

## Verification Gates

| Gate           | Command                                   | Success Criteria |
| -------------- | ----------------------------------------- | ---------------- |
| Types          | `pnpm --filter @repo/workers check-types` | Zero errors      |
| Lint           | `pnpm --filter @repo/workers lint`        | Zero violations  |
| Tests          | `pnpm --filter @repo/workers test`        | All suites green |
| Deploy dry-run | `pnpm --filter @repo/workers build`       | Exit 0           |

## Cross-Plan References

| Type       | Blueprint                 | Relationship                                                                             |
| ---------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| Downstream | `cf-queues-delivery`      | Queue consumer inherits the same Env type with RATE_LIMITER                              |
| Downstream | `durable-objects-fan-out` | WebSocket upgrade path should bypass rate limiter (stateful connection, not per-request) |

## Edge Cases and Error Handling

| Edge Case                                      | Risk                                               | Solution                               | Task |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------- | ---- |
| `/health` endpoint gets IP-keyed rate limiting | Low — health checks from CF infra could trigger it | Exempt `/health` from middleware       | 1.3  |
| `userId` absent before auth middleware runs    | Medium — anon key floods limiter                   | Fall back to `cf-connecting-ip` header | 1.2  |

## Non-goals

- Per-plan tier limits (free vs paid users get different caps).
- True sliding-window precision (token bucket is sufficient for v1).
- Rate limiting on WebSocket upgrade (handled by `durable-objects-fan-out`).

## Risks

| Risk                                                                  | Impact | Mitigation                                                   |
| --------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| `namespace_id = "1001"` conflicts with another binding on the account | Low    | Use a unique integer; document in Doppler/infra config       |
| CF Rate Limiting not available on Free plan                           | Medium | Verify plan before deploy; the binding requires Workers Paid |

## Technology Choices

| Component     | Technology               | Version              | Why                                                |
| ------------- | ------------------------ | -------------------- | -------------------------------------------------- |
| Rate limiting | CF Rate Limiting binding | `wrangler >= 4.36.0` | Edge-distributed token bucket, zero infra, per-key |
