---
type: research
last_updated: "2026-04-22"
---

# Cloudflare architecture evaluation for node-pubsub (April 2026)

> Research artifact — evaluative, not prescriptive. Prescribe through a
> blueprint or ADR if a conclusion becomes load-bearing.

## Question

As of **April 22, 2026**, which current Cloudflare platform capabilities
and adjacent libraries are the best fit to improve `node-pubsub`
architecture, scalability, sliding-window enforcement, and replay
resistance?

## Method

- Reviewed the Cloudflare product catalog and narrowed it to the product
  surfaces materially relevant to this repo's current Worker-based
  architecture.
- Re-read the current Worker implementation and schema to anchor the
  report in shipped code rather than aspiration.
- Re-verified time-sensitive claims against official Cloudflare docs and
  official library docs/repos on **April 22, 2026**.

### Repo files inspected

- `apps/workers/src/routes/message.ts:68-79,84-199`
- `apps/workers/src/routes/topic.ts:205-247`
- `apps/workers/src/db/schema.ts:45-57`
- `apps/workers/src/middleware/auth.ts:29-79,143-166`
- `apps/workers/src/db/client.ts`
- `apps/workers/wrangler.toml`
- `infra/src/resources/main.ts`
- `infra/src/resources/exports-workers.ts`
- `infra/src/deploy/wrangler-config.ts`

### Commands run

- `nl -ba apps/workers/src/routes/message.ts | sed -n '60,220p'`
- `nl -ba apps/workers/src/routes/topic.ts | sed -n '190,250p'`
- `nl -ba apps/workers/src/db/schema.ts | sed -n '35,90p'`
- `nl -ba apps/workers/src/middleware/auth.ts | sed -n '20,190p'`
- `sed -n '1,220p' apps/workers/wrangler.toml`

### External sources consulted on 2026-04-22

- Cloudflare product catalog: <https://workers.cloudflare.com/products/>
- Workers best practices: <https://developers.cloudflare.com/workers/best-practices/workers-best-practices/>
- Workers bindings: <https://developers.cloudflare.com/workers/runtime-apis/bindings/>
- Queues overview: <https://developers.cloudflare.com/queues/>
- Queues dead-letter queues: <https://developers.cloudflare.com/queues/configuration/dead-letter-queues/>
- Queues consumer concurrency: <https://developers.cloudflare.com/queues/configuration/consumer-concurrency/>
- Durable Objects overview: <https://developers.cloudflare.com/durable-objects/>
- Durable Objects SQLite storage: <https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/>
- Workflows: <https://developers.cloudflare.com/workflows/>
- Hyperdrive connection pooling: <https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/>
- Hyperdrive query caching: <https://developers.cloudflare.com/hyperdrive/concepts/query-caching/>
- Workers rate limiting binding: <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>
- Turnstile server-side validation: <https://developers.cloudflare.com/turnstile/get-started/server-side-validation/>
- API Shield JWT validation: <https://developers.cloudflare.com/api-shield/security/jwt-validation/>
- API Shield sequence analytics: <https://developers.cloudflare.com/api-shield/security/sequence-analytics/>
- API Shield endpoint management limitations: <https://developers.cloudflare.com/api-shield/management-and-monitoring/endpoint-management/>
- Workers traces: <https://developers.cloudflare.com/workers/observability/traces/>
- Workers logs: <https://developers.cloudflare.com/workers/observability/logs/workers-logs/>
- Analytics Engine: <https://developers.cloudflare.com/analytics/analytics-engine/>
- Hono on Cloudflare Workers: <https://hono.dev/docs/getting-started/cloudflare-workers>
- Hono OpenAPI example: <https://hono.dev/examples/hono-openapi>
- Valibot: <https://valibot.dev/>
- Valibot Standard Schema integration: <https://valibot.dev/guides/integrate-valibot/>
- `jose`: <https://github.com/panva/jose>
- Chanfana: <https://github.com/cloudflare/chanfana>

## Findings

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                        |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| F1  | high     | **Shipped:** the repo already runs on the right baseline: Cloudflare Workers + Hono + Hyperdrive + Postgres. The next bottlenecks are coordination, delivery semantics, and abuse controls — not a wholesale platform rewrite.                                                                                                                                                                                                                               | `apps/workers/wrangler.toml`; `apps/workers/src/db/client.ts`; infra provisions Hyperdrive, KV, R2, and routes. |
| F2  | high     | **Partial:** the current receive path is not a real lease / visibility-timeout system. `GET /api/messages/:queueId` reads rows with `received = false`, returns them, then flips `received = true`; the returned `visibilityTimeout` value is not backed by a stored lease expiry.                                                                                                                                                                           | `apps/workers/src/routes/message.ts:84-148`; `apps/workers/src/db/schema.ts:45-57`.                             |
| F3  | high     | **Partial:** push delivery is still coupled to request handling through fire-and-forget `fetch()` calls whose errors are swallowed. That makes retries, DLQ behavior, and auditability weaker than the platform can support.                                                                                                                                                                                                                                 | `apps/workers/src/routes/message.ts:68-79`; `apps/workers/src/routes/topic.ts:228-237`.                         |
| F4  | high     | **Shipped on platform / absent in repo:** Cloudflare Queues are the most direct fit for async fan-out, buffering, retries, DLQ, pull consumers, and backlog-driven scale-out. Cloudflare’s own Workers best-practices page explicitly recommends **Queues** for decoupled, single-step background work and notes **at-least-once delivery** with configurable retries.                                                                                       | Cloudflare Queues overview; Workers best practices, fetched 2026-04-22.                                         |
| F5  | high     | **Shipped on platform / absent in repo:** Durable Objects are the strongest fit for the coordination plane: ordered dequeue, lease ownership, dedupe windows, nonce registries, replay cursors, and WebSocket fan-out. Current Cloudflare docs recommend SQLite-backed namespaces for new Durable Objects and expose SQL, alarms, and PITR APIs.                                                                                                             | Durable Objects overview; SQLite storage docs, fetched 2026-04-22.                                              |
| F6  | high     | **Fact check:** the Workers rate-limiting binding is fast, but it is **local to each Cloudflare location** and its simple window is constrained to **10 or 60 seconds**. It is useful as a soft or regional gate, not as strict global sliding-window accounting.                                                                                                                                                                                            | Workers rate-limit docs, fetched 2026-04-22.                                                                    |
| F7  | medium   | **Shipped on platform / absent in repo:** Turnstile materially helps browser-facing replay resistance because server-side validation is mandatory, tokens are valid for **300 seconds**, and each token is **single-use**.                                                                                                                                                                                                                                   | Turnstile validation docs, fetched 2026-04-22.                                                                  |
| F8  | medium   | **Shipped on platform / partial fit:** API Shield can add JWT validation and sequence analysis, but it is not a full replacement for application-level stateful replay protection. Also, Endpoint Management metrics do **not** populate when a Worker is serving the endpoint.                                                                                                                                                                              | API Shield JWT validation, Sequence Analytics, and Endpoint Management limitation docs, fetched 2026-04-22.     |
| F9  | medium   | **Shipped:** Hyperdrive remains a good fit for the repo’s primary data plane. Current docs say the pooler operates in **transaction mode**, and query caching is **enabled by default** for cacheable reads. This supports keeping Postgres as the durable system of record while moving queue coordination elsewhere.                                                                                                                                       | Hyperdrive connection-pooling and query-caching docs, fetched 2026-04-22.                                       |
| F10 | medium   | **Shipped on platform / absent in repo:** Workers Logs, Traces, and Analytics Engine can cover delivery observability, but they are not free abstractions. Workers Logs are account-stored observability data; Workers Traces billing began on **March 1, 2026** per current docs.                                                                                                                                                                           | Workers Logs, Traces, and Analytics Engine docs, fetched 2026-04-22.                                            |
| F11 | medium   | **Partial:** auth and validation are materially weaker than current platform and library options. The repo manually parses HS256 JWTs and includes placeholder-ish password-hash behavior. This is a stronger argument for `jose` plus schema-first request validation than for adding another database.                                                                                                                                                     | `apps/workers/src/middleware/auth.ts:29-79,143-166`; `jose`; Hono OpenAPI; Valibot; Chanfana.                   |
| F12 | low      | **Catalog review:** Cloudflare’s April 22, 2026 product catalog spans compute, storage, AI, media, network, and SASE / Zero Trust. For `node-pubsub`, the materially relevant additions are Queues, Durable Objects, Workflows, WAF / Rate Limiting, Turnstile, API Shield, Service Bindings, Observability, and Secrets Store. Products like AI Search, Vectorize, RealtimeKit, or Mesh are not first-order architecture wins for the repo’s current scope. | Cloudflare product catalog, fetched 2026-04-22.                                                                 |

## Conclusions

### What the evidence most strongly implies

1. **Keep Workers + Hyperdrive + Postgres as the primary data plane.**
   The evidence does not support a first move to D1 or another storage
   migration.
2. **Add Cloudflare Queues first.**
   This is the cleanest path to decouple publish requests from delivery,
   introduce DLQ and retry semantics, and let consumer concurrency scale
   with backlog.
3. **Add Durable Objects second, as a control plane rather than a full
   data-plane replacement.**
   Use them for queue coordination, leases, ordering, dedupe, replay
   cursors, and strict quota accounting.
4. **Treat sliding-window enforcement as a two-layer problem.**
   Use WAF / edge rate limiting for broad abuse control and a Durable
   Object for strict per-tenant or per-key accounting. The Workers
   rate-limit binding alone is not strict enough for a global quota.
5. **Treat replay defense as a state problem, not just a JWT problem.**
   Use nonce / idempotency registries, message IDs, replay cursors, and
   queue redrive paths. API Shield JWT validation and Turnstile help, but
   they do not replace application-owned state.
6. **Use Workflows where recovery spans multiple steps or long waits.**
   They fit redrive, webhook recovery, imports, and operator-approved
   replay better than ad hoc Worker code.
7. **Prioritize schema-first validation and JWT hardening before adding
   more surface area.**
   The strongest library additions are `jose` plus either
   `Valibot + hono-openapi` or `chanfana`.

### Product priority labels

Use these labels operationally, not philosophically:

- **[under attack/security concerns]** — move to the top if you are already
  seeing abuse, bot traffic, credential stuffing, or replay attempts
- **[asap]** — highest-leverage architecture work that should happen next
- **[next]** — important follow-on work after the first control-plane changes
- **[later]** — useful, but not a first-order bottleneck today
- **[optional]** — only if the product scope expands or a new constraint appears
- **[keep/current]** — already the right fit; improve around it instead of
  replacing it

| Product                              | Priority label                       | Why                                                                                                                             |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Queues**                           | **[asap]**                           | Best immediate fix for direct `fetch()` fan-out, retries, DLQ, and backlog-driven scale-out.                                    |
| **Durable Objects**                  | **[asap]**                           | Best fit for leases, ordering, dedupe, replay cursors, and strict sliding-window / quota state.                                 |
| **WAF rate limiting**                | **[under attack/security concerns]** | Fastest perimeter control when abuse is already happening. Also useful as the outer layer even after Durable Objects land.      |
| **Turnstile**                        | **[under attack/security concerns]** | Highest-value browser-facing anti-bot and replay-resistance addition because tokens are single-use and short-lived.             |
| **API Shield**                       | **[next]**                           | Valuable for JWT validation, schema validation, and sequence analysis, but not a replacement for app-owned replay state.        |
| **Workflows**                        | **[next]**                           | Strong fit for multi-step recovery, redrive, approvals, and other long-running async flows once Queues + Durable Objects exist. |
| **Workers Logs / Traces**            | **[next]**                           | Needed once async delivery becomes more complex; otherwise you will not see queue lag, retries, or replay behavior clearly.     |
| **Analytics Engine**                 | **[next]**                           | Good for durable product and operations analytics after baseline logging exists.                                                |
| **Service Bindings**                 | **[next]**                           | Worth adding if the Worker splits into internal services or RPC-style auth / dispatch helpers.                                  |
| **Secrets Store**                    | **[next]**                           | Good account-level secret hygiene improvement, but less urgent than delivery semantics and abuse controls.                      |
| **Hyperdrive**                       | **[keep/current]**                   | Already the right fit; keep using it rather than replacing it right now.                                                        |
| **D1**                               | **[later]**                          | Not the first scalability move; consider only for smaller local control-plane metadata if it simplifies a future design.        |
| **KV / R2**                          | **[later]**                          | Useful supporting stores for specific patterns, but not the primary next architecture decision.                                 |
| **Mesh / deeper private networking** | **[optional]**                       | Only if private-only service connectivity becomes a real operational requirement.                                               |

### Recommended technology order

- **P0** — Cloudflare Queues + DLQ + explicit consumer retry model
- **P0** — Durable Object queue coordinator for lease / ordering /
  dedupe / replay state
- **P1** — Schema-first request validation and JWT hardening
- **P1** — WAF rate limiting + Turnstile on browser-facing and anonymous
  entrypoints
- **P1** — Observability dashboards for queue lag, retries, DLQ growth,
  and replay activity
- **P2** — Workflows for redrive, recovery, approval-gated operations,
  and other multi-step async jobs
- **Later, if product scope changes** — D1 for small local control-plane
  metadata, or Mesh / deeper private networking features

### What remains unknown

- Actual publish / receive / retry throughput targets per tenant
- Whether strict global ordering is required per queue, per topic, or
  only per consumer group
- Whether browser-facing anonymous ingress is a real production use case
- Whether replay requirements are operational-only or customer-visible

### What would reduce uncertainty

- A blueprint that defines delivery semantics: ordering, lease expiry,
  retry policy, DLQ thresholds, and replay UX
- Load tests against the current Postgres-backed receive path
- A threat model for auth, abuse, and replay keyed to real clients

## Implications

This research should inform a follow-up blueprint for a Worker-native
queue control plane. The likely sequence is:

1. Introduce **Queues** for async dispatch.
2. Introduce a **Durable Object** that owns lease, ordering, dedupe, and
   replay state.
3. Replace manual JWT verification with **`jose`**.
4. Add schema-first validation / OpenAPI generation.
5. Instrument queue and replay behavior before broadening scope.

Hypotheses this research retires:

- **Retire:** “D1 is the first scalability move.”
- **Retire:** “The Workers rate-limit binding alone is enough for strict
  sliding-window quotas.”
- **Retire:** “JWT validation alone solves replay.”
- **Retire:** “Direct `fetch()` fan-out is good enough once traffic
  rises.”
