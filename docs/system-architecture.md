---
type: system
last_updated: "2026-04-26"
---

# System Architecture

End-to-end view of IngestLens: edge entrypoints, Worker apps, durable
state, AI mapping path, and Consistency Lab. Treat this as the canonical
mermaid chart for the repo. Component-level invariants and code paths
live in [`architecture.md`](./architecture.md).

## Top-level diagram

```mermaid
flowchart LR
  subgraph CLIENT["Browsers / API consumers"]
    UI["IngestLens SPA<br/>(apps/client, React Router)"]
    OPER["Operator / API client"]
    SRC["Third-party payload source"]
  end

  subgraph EDGE["Cloudflare edge"]
    SPA["Worker: ozby.dev<br/>(apps/client → Workers Assets)"]
    API["Worker: api.ozby.dev<br/>(apps/workers, Hono)"]
    LAB["Worker: Consistency Lab<br/>(apps/lab, Hono SSR + htmx)"]
    HD["Hyperdrive pool"]
    DQ[("Cloudflare Queue:<br/>DELIVERY_QUEUE")]
    DLQ[("delivery-dlq")]
    KV[("KV: KillSwitchKV<br/>+ JWT jti revocation")]
    RL["Rate limiter bindings<br/>(API + AUTH_RATE_LIMITER)"]
    AE[("Analytics Engine")]
    AI["Workers AI<br/>(mapping suggestion)"]
  end

  subgraph DO["Durable Objects"]
    TR["TopicRoom DO<br/>(WS fan-out + replay log)"]
    HS["HealStreamDO<br/>(schema drift coordinator + SSE)"]
    SL["SessionLock DO"]
    GAUGE["LabConcurrencyGauge DO"]
    S1A["S1aRunnerDO (correctness)"]
    S1B["S1bRunnerDO (latency)"]
  end

  subgraph DATA["State"]
    PG[("Postgres via Neon<br/>(public.* + lab.*)")]
    NEON["Neon branches<br/>(@webpresso/db-branching)"]
  end

  subgraph INTAKE["AI intake / mapping (apps/workers)"]
    INR["/api/intake/* routes"]
    SFP["shapeFingerprint()<br/>(structural drift detection)"]
    ADP["aiMappingAdapter<br/>(Workers AI mapping)"]
    NORM["normalizeWithMapping()<br/>+ approvedMappingRevisions"]
    FIX["Public ATS fixtures<br/>(open-apply-sample.jsonl)"]
    HEAL["/api/heal/stream/* routes"]
  end

  UI --> SPA
  OPER --> API
  SRC --> API
  SPA -. "deep links<br/>(SPA fallback)" .-> SPA

  API --> RL
  API --> HD --> PG
  API -->|publish| DQ
  API -->|JWT verify + jti check| KV
  API --> INR
  INR --> SFP
  SFP -->|"shape match (fast path)"| NORM
  SFP -->|"shape mismatch"| ADP
  ADP --> AI
  ADP -->|"confidence ≥ 0.8"| HS
  HS -->|"write coordinator"| PG
  HS -->|"SSE broadcast"| OPER
  HEAL --> HS
  ADP --> NORM --> PG
  INR --> FIX

  DQ -->|batch consume| API
  API -->|push delivery 2xx/5xx<br/>retry+DLQ| DLQ
  API -->|notify on ack| TR
  TR <-->|WebSocket fan-out + replay| UI
  API -->|telemetry| AE

  LAB --> KV
  LAB --> SL
  LAB --> GAUGE
  LAB --> S1A
  LAB --> S1B
  S1A -->|3 paths: CFQueues / PgPolling / PgDirectNotify| PG
  S1B --> PG
  S1A --> AE
  S1B --> AE

  PG -.->|ephemeral E2E branches| NEON
```

## Layer notes

- **Edge SPA worker** (`apps/client`): Workers Assets host with SPA
  fallback for deep links. No server-side rendering.
- **API worker** (`apps/workers`): Hono on Cloudflare Workers. Owns
  auth, queue/topic CRUD, push delivery consumer, AI intake routes,
  WebSocket upgrade for `TopicRoom` DOs.
- **Lab worker** (`apps/lab`): Hono SSR + htmx; isolated kill switch,
  cost ceiling, and SessionLock-gated runners. Never shares state with
  the API worker beyond the `lab.*` schema.
- **Durable Objects**: `TopicRoom` is the production fan-out + reconnect
  replay primitive; `HealStreamDO` (one per `sourceSystem:contractId:contractVersion`)
  is the write coordinator for schema drift healing — it serializes concurrent
  heal writes via the CF input gate and broadcasts SSE events to operator
  subscribers; `SessionLock`, `LabConcurrencyGauge`, and the two scenario runner
  DOs are lab-internal.
- **Postgres**: single Neon project. Production tables live in
  `public.*`; lab tables strictly under `lab.*` (CI-enforced).
  `@webpresso/db-branching` provides the vendor-agnostic interface;
  `packages/neon` is the Neon implementation used in E2E.
- **AI intake path**: only AI call site is mapping repair suggestion.
  `shapeFingerprint()` detects structural drift before calling the LLM.
  On shape-match (fast path) the LLM is skipped entirely; on mismatch at
  ≥ 0.8 confidence `HealStreamDO.tryHeal()` auto-approves the new mapping.
  Every step after mapping approval — schema validation, normalization,
  publish — is deterministic code.
- **Workers test substrate**: `@webpresso/workers-test-kit` is the
  upstream for `BaseWorkerEnv`, `createMockExecutionContext`, and
  `createMockHyperdrive`. `packages/test-utils` only re-exports
  `deepFreeze` for cross-package use.

## Cross-cutting concerns

| Concern          | Where it lives                                                      |
| ---------------- | ------------------------------------------------------------------- |
| Auth             | `apps/workers/src/middleware/auth.ts` + KV jti revocation (h-001)   |
| Rate limiting    | API + `AUTH_RATE_LIMITER` bindings (per-PoP token bucket, ADR 0004) |
| Telemetry        | Analytics Engine — `analytics-engine-telemetry` blueprint           |
| Replay           | `TopicRoom` DO + Postgres `messages.seq` (`message-replay-cursor`)  |
| Bundle budgets   | `pnpm client:bundle:check` (`client-route-code-splitting`)          |
| Mutation testing | Stryker per-package + CI gate (`stryker-mutation-guardrails`)       |
| Doppler secrets  | `bun ./scripts/with-doppler.ts` wrapper (no `.env`)                 |

## Related

- [Architecture (component detail)](./architecture.md)
- [Delivery guarantees](./delivery-guarantees.md)
- [Scale considerations](./scale-considerations.md)
- [ADR index](./adrs/README.md)
- [Roadmap](../ROADMAP.md)
