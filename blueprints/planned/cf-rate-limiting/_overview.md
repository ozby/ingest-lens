---
type: blueprint
status: planned
complexity: XS
created: "2026-04-22"
last_updated: "2026-04-22"
progress: "0% (refined)"
depends_on: []
tags:
  - cloudflare-workers
  - rate-limiting
  - security
---

# CF Rate Limiting binding

**Goal:** Add Cloudflare's native Rate Limiting binding to `apps/workers` as a
**token-bucket edge guardrail** for authenticated Worker routes. This blueprint
is intentionally **not** a true sliding-window implementation.

## Planning Summary

- **Why now:** There is no rate limiting in the Worker runtime today. The
  authenticated API surface is effectively unbounded.
- **Scope:** One `[[ratelimits]]` binding in `apps/workers/wrangler.toml`; one
  reusable Hono middleware; route-level mounting on the authenticated Worker
  routers that already call `authenticate`.
- **Out of scope:** WAF rate-limiting rules, Turnstile, and strict global
  sliding-window quotas. If strict accounting becomes a hard requirement, it
  must move to a Durable Object with SQLite-backed timestamp tracking.

## Refinement Summary

- Corrected the terminology from “sliding window” to **token bucket with a
  mandatory 10 s or 60 s window**.
- Dropped the stale Cloudflare PubSub note from the implementation path; it is
  not relevant to this blueprint.
- Moved the middleware wiring from global `index.ts` mounting to the actual
  authenticated routers, because route-local `authenticate` must run first if
  the limiter keys on `userId`.

## Pre-execution audit (2026-04-22)

**Readiness:** ready-optional

**What is already true**

- `apps/workers/src/routes/queue.ts`, `message.ts`, `topic.ts`, and
  `dashboard.ts` already mount `authenticate`, so route-level limiter wiring is
  realistic.
- `@cloudflare/workers-types` in the current workspace already exposes
  `RateLimit`.

**Main gaps before implementation**

- `apps/workers/wrangler.toml` has no rate-limit binding today and there is no
  generated `wrangler.generated.toml` in the workspace. A real namespace ID is
  still needed before deploy.
- Current route tests are mostly unauthenticated `401` smoke tests. To verify
  limiter behavior, implementation will need an authenticated test helper and a
  mocked `RATE_LIMITER` binding.

**First-build notes**

- Keep the limiter mounted on the authenticated routers, not globally in
  `index.ts`.
- Start with queue / message / topic / dashboard routes only; leave `/health`
  and `/api/auth/*` untouched in this wave.

## Architecture Overview

```text
before:
  /api/queues/*, /api/messages/*, /api/topics/*, /api/dashboard/*
    → authenticate
    → handler

after:
  /api/queues/*, /api/messages/*, /api/topics/*, /api/dashboard/*
    → authenticate
    → rateLimiter(userId)
    → handler

note:
  This is edge token-bucket limiting, not strict global sliding-window accounting.
```

## Fact-Checked Findings

| ID  | Severity | Claim                                                                                       | Source                                                                       |
| --- | -------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F1  | HIGH     | Workers Rate Limiting is local to the Cloudflare location serving the request.              | Cloudflare Workers rate-limit docs, fetched 2026-04-22.                      |
| F2  | HIGH     | The simple binding window must be either `10` or `60` seconds.                              | Cloudflare Workers rate-limit docs, fetched 2026-04-22.                      |
| F3  | MEDIUM   | The binding is best treated as a fast perimeter / edge limiter, not a precise quota ledger. | Cloudflare Workers rate-limit docs + research synthesis, fetched 2026-04-22. |

## Key Decisions

| Decision        | Choice                                                                                               | Rationale                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Key granularity | `userId` after auth; fall back to `cf-connecting-ip` only when needed in tests or future anon routes | Per-user fairness is the useful default for the current Worker API           |
| Window          | `100 requests / 60 seconds`                                                                          | Conservative starting point; easy to tune later                              |
| Mount point     | `queueRoutes`, `messageRoutes`, `topicRoutes`, `dashboardRoutes` after `authenticate`                | Keeps `/health` and `/api/auth/*` out of scope and avoids pre-auth ambiguity |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable |
| ----------------- | --------- | ------------ | -------------- |
| **Wave 1**        | 1.1, 1.2  | None         | 2 agents       |
| **Wave 2**        | 1.3       | 1.1 + 1.2    | 1 agent        |
| **Critical path** | 1.1 → 1.3 | —            | 2 waves        |

---

### Phase 1: Binding, middleware, and router wiring [Complexity: XS]

#### [config] Task 1.1: Wrangler binding + Env type

**Status:** pending

**Depends:** None

Add a rate-limit binding to `apps/workers/wrangler.toml` and extend the Worker
`Env` type.

**Files:**

- Modify: `apps/workers/wrangler.toml`
- Modify: `apps/workers/src/db/client.ts`

**Steps (TDD):**

1. Add a `[[ratelimits]]` block to `apps/workers/wrangler.toml` using a real
   placeholder instead of the fake `1001` value:
   ```toml
   [[ratelimits]]
   name = "RATE_LIMITER"
   namespace_id = "<cloudflare-rate-limit-namespace-id>"
   simple = { limit = 100, period = 60 }
   ```
2. Add `RATE_LIMITER: RateLimit` to the `Env` type in
   `apps/workers/src/db/client.ts`.
3. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] `wrangler.toml` contains a `[[ratelimits]]` block with `limit = 100` and `period = 60`
- [ ] `Env` includes `RATE_LIMITER: RateLimit`
- [ ] `pnpm --filter @repo/workers check-types` passes

---

#### [middleware] Task 1.2: Create `rateLimiter` middleware

**Status:** pending

**Depends:** None

Create a reusable Hono middleware that calls
`env.RATE_LIMITER.limit({ key: userId })` and returns `429` on failure.

**Files:**

- Create: `apps/workers/src/middleware/rateLimiter.ts`
- Create: `apps/workers/src/tests/rateLimiter.test.ts`

**Steps (TDD):**

1. Write `rateLimiter.test.ts` with two cases: allowed request falls through;
   blocked request returns `429` with `Retry-After: 60`.
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. Implement `rateLimiter.ts` so it reads `c.get("user")`, calls the binding,
   and returns JSON `{ status: "error", message: "Rate limit exceeded" }`
   when `success === false`.
4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers lint` — verify PASS.

**Acceptance:**

- [ ] Tests cover allowed + blocked behavior
- [ ] Blocked requests return `429` with `Retry-After: 60`
- [ ] `pnpm --filter @repo/workers test` is green

---

#### [wire] Task 1.3: Mount the limiter on authenticated routers

**Status:** pending

**Depends:** Task 1.1, Task 1.2

Mount `rateLimiter` on the Worker routers that already run `authenticate`.
Do **not** mount it globally in `index.ts`.

**Files:**

- Modify: `apps/workers/src/routes/queue.ts`
- Modify: `apps/workers/src/routes/message.ts`
- Modify: `apps/workers/src/routes/topic.ts`
- Modify: `apps/workers/src/routes/dashboard.ts`

**Steps (TDD):**

1. Add assertions or route smoke tests to verify protected routes still return
   `401` when unauthenticated and can return `429` once authenticated + blocked.
2. Run: `pnpm --filter @repo/workers test` — verify FAIL.
3. In each authenticated router, import `rateLimiter` and mount it directly
   after `authenticate`, for example:
   ```ts
   queueRoutes.use("*", authenticate);
   queueRoutes.use("*", rateLimiter);
   ```
4. Run: `pnpm --filter @repo/workers test` — verify PASS.
5. Run: `pnpm --filter @repo/workers check-types` — verify PASS.

**Acceptance:**

- [ ] `rateLimiter` is mounted on `queue`, `message`, `topic`, and `dashboard` routers
- [ ] `/health` and `/api/auth/*` remain out of scope for this blueprint
- [ ] `pnpm --filter @repo/workers check-types` passes

---

## Verification Gates

| Gate           | Command                                   | Success Criteria |
| -------------- | ----------------------------------------- | ---------------- |
| Types          | `pnpm --filter @repo/workers check-types` | Zero errors      |
| Lint           | `pnpm --filter @repo/workers lint`        | Zero violations  |
| Tests          | `pnpm --filter @repo/workers test`        | All suites green |
| Deploy dry-run | `pnpm --filter @repo/workers build`       | Exit 0           |

## Cross-Plan References

| Type       | Blueprint                 | Relationship                                                                                                                    |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Downstream | `durable-objects-fan-out` | WebSocket upgrade routes should remain outside this request-per-request limiter if connection semantics need different handling |

## Edge Cases and Error Handling

| Edge Case                                  | Risk   | Solution                                                                                   | Task      |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------ | --------- |
| Auth runs after the limiter                | High   | Avoid global mounting; mount limiter on authenticated routers only                         | 1.3       |
| Future anonymous endpoints need protection | Medium | Add a separate IP-keyed or Turnstile-backed blueprint rather than widening this one ad hoc | follow-up |

## Non-goals

- True sliding-window accounting
- WAF rate limiting rules
- Turnstile
- Per-tier product quotas

## Risks

| Risk                                                          | Impact | Mitigation                                                                      |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| The edge limiter is mistaken for a strict global quota ledger | Medium | Keep the blueprint language explicit: this is token-bucket edge protection only |
| The namespace ID is not provisioned before deploy             | Low    | Leave an explicit placeholder and validate before `wrangler deploy`             |

## Technology Choices

| Component    | Technology                       | Version     | Why                                                          |
| ------------ | -------------------------------- | ----------- | ------------------------------------------------------------ |
| Edge limiter | Cloudflare Rate Limiting binding | CF platform | Lowest-friction perimeter control for the current Worker API |
