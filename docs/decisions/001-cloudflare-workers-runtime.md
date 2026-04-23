---
type: adr
last_updated: "2026-04-22"
---

# ADR 001: Cloudflare Workers as the runtime

**Status:** Accepted

## Context

The system needs a compute layer that handles HTTP requests and queue consumers. The options
evaluated were:

- Long-running Node.js server (Express/Hono) on a VM or container
- AWS Lambda (or similar FaaS)
- Cloudflare Workers

The primary design constraint is cost at low traffic: a pub/sub platform for developer use cases
spends most of its time idle. Any runtime with a per-second or per-instance pricing model charges
for idle capacity.

A secondary constraint is operational simplicity: no Docker, no Kubernetes, no auto-scaling
configuration, no health checks.

## Decision

Use Cloudflare Workers as the sole compute layer for both HTTP request handling and queue
consumption.

## Consequences

**Positive:**

- Zero idle cost. Workers are billed per request (CPU-time), not per hour of capacity provisioned.
- No cold start problem in the traditional sense. Workers use V8 isolate recycling rather than
  container startup, making cold starts measured in milliseconds rather than seconds.
- The same `wrangler.toml` configuration file describes both the HTTP handler and the queue
  consumer — one deployment artifact.
- Cloudflare's global network means the Worker runs at the PoP nearest to the client, not in
  a single chosen region.

**Negative:**

- **30-second CPU time limit** per request (configurable to 5 minutes for scheduled workers and
  queue consumers). Any operation that runs longer must be broken into async jobs.
- **128 MB memory limit** per isolate. No feasible workaround — memory-intensive operations must
  be offloaded.
- **`nodejs_compat` mode** is required for Postgres and Drizzle ORM (both use Node TCP sockets).
  This mode is well-tested but adds approximately 2ms to cold isolate initialization and
  occasionally exposes compatibility gaps with Node's stream and buffer implementations.
- Local development with `wrangler dev` does not exercise Hyperdrive pooling or caching. The
  production and development environments are not equivalent.
- No support for long-running background processes. The isolate is garbage-collected after the
  response is sent. Background work must go through a Queue or an Alarm on a Durable Object.

## Alternatives considered

**AWS Lambda:**  
Cold starts are 100-500ms for Node.js runtimes. Provisioned concurrency mitigates this but adds
cost. The pricing model (per GB-second) is comparable at low traffic. Lambda lacks first-class
queue consumer support without SQS trigger configuration. Rejected: higher operational complexity,
similar cost profile, slower cold starts.

**Long-running Node.js server:**  
Full Node.js compatibility, no isolate constraints. Requires container management, auto-scaling,
load balancers, and health checks. Pay-for-idle cost model. Rejected: operational overhead
is disproportionate for a platform at this scale.
