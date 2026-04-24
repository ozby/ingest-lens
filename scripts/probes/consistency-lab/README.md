# Consistency Lab — Fact-Check Probes

Pre-flight probes that reproduce every load-bearing external claim the
consistency-lab blueprints depend on. Runs via `bun scripts/probes/consistency-lab/run-all.ts`.

Each probe emits one JSONL verdict line to stdout and to `verdicts.jsonl`:

```json
{
  "probe": "p07-...",
  "verdict": "CONFIRMED",
  "claim": "...",
  "evidence": "...",
  "citation": "https://...",
  "ranAt": "..."
}
```

## Verdicts

| Verdict             | Meaning                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `CONFIRMED`         | Claim reproduces under probe conditions                               |
| `WRONG`             | Claim fails; blueprint must revise                                    |
| `PARTIAL`           | Partial evidence; full probe is stubbed                               |
| `UNREACHABLE`       | Probe threw before verdict; treat as inconclusive                     |
| `SKIPPED_NO_ACCESS` | Deploy-gated probe; required CF / Neon / Doppler env vars not present |

The orchestrator fails the exit code only on `WRONG`. Everything else is surfaced.

## Probes

| ID  | Claim                                                                                        | Access       |
| --- | -------------------------------------------------------------------------------------------- | ------------ |
| p01 | Hyperdrive does NOT support LISTEN/NOTIFY; direct TCP from Worker does                       | deploy-gated |
| p02 | Worker CPU configurable to 300s on paid tier                                                 | deploy-gated |
| p03 | HTMX 2.0.x + htmx-ext-sse 2.2.x support Last-Event-ID replay + sse-swap                      | local + TODO |
| p04 | Workers Assets binding uses `directory` + `binding` keys                                     | local        |
| p05 | Inline t-digest produces p99 within ±2% on 10k samples (Workers-compatible)                  | local        |
| p06 | Doppler REST API accepts secret updates with write-scoped token                              | deploy-gated |
| p07 | Inter (family includes Inter Tight) is OFL 1.1                                               | local        |
| p08 | JetBrains Mono typeface is OFL 1.1 (Apache 2.0 covers build scripts)                         | local        |
| p09 | CF Queues wrangler binding model: second consumer binding → reject or silent-replace         | deploy-gated |
| p10 | CF GraphQL Analytics is not authoritative for billing; no public Worker-callable billing API | local        |

## Env for deploy-gated probes

Probes marked `deploy-gated` auto-skip unless their required env vars are present:

- **p01**: `NEON_API_KEY`, `NEON_PROJECT_ID`, `LAB_PROBE_WORKER_URL`
- **p02**: `LAB_PROBE_WORKER_URL`, `CF_ACCOUNT_TIER`
- **p06**: `DOPPLER_PROBE_PROJECT`, `DOPPLER_PROBE_CONFIG`, `DOPPLER_PROBE_TOKEN_WRITE`, `DOPPLER_PROBE_TOKEN_READ`
- **p09**: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `LAB_PROBE_QUEUE_NAME`

## Invoking

```bash
bun scripts/probes/consistency-lab/run-all.ts
```

Or a single probe:

```bash
bun scripts/probes/consistency-lab/p07-inter-tight-license.ts
```

## Interpreting `verdicts.jsonl`

`verdicts.jsonl` is rewritten on every `run-all.ts` invocation. Each line is a
JSON object; parse with `jq` to filter:

```bash
jq 'select(.verdict == "CONFIRMED")' scripts/probes/consistency-lab/verdicts.jsonl
jq 'select(.verdict == "WRONG")'      scripts/probes/consistency-lab/verdicts.jsonl
```

## When to re-run

- Before a consistency-lab blueprint moves from `planned/` to `in-progress/`
- Monthly — CF, HTMX, Doppler change behavior; probes are regression gates
- Whenever a related CF docs page shows `LastChanged` bumps
