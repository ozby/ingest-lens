---
type: tech-debt
status: accepted
severity: low
category: dependency
review_cadence: quarterly
last_reviewed: "2026-04-25"
created: "2026-04-25"
linked_blueprints: []
affected_modules:
  - apps/lab/src/crons/cost-estimator.ts
  - apps/lab/wrangler.toml
---

# CF Analytics Engine integration for CostEstimatorCron

## Problem

`CostEstimatorCron` in `apps/lab/src/crons/cost-estimator.ts` currently
returns `0` as a safe fallback from `queryMonthlyCounter()` because the CF
Analytics Engine dataset (`lab_events`) has not been provisioned. The cron
runs on schedule and calculates costs, but the message-count input is always 0,
making the cost estimate meaningless and the $50 kill-switch trigger inert.

## Remediation

### Step 1 — Provision the CF Analytics Engine dataset (CF dashboard, ~2 min)

```
Dashboard → Workers & Pages → Analytics Engine → Create dataset
Dataset name: lab_events
```

Copy the dataset ID returned by the dashboard.

### Step 2 — Update wrangler.toml (already partially done)

`apps/lab/wrangler.toml` already has:

```toml
[[env.dev.analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "lab_events"
```

Verify the dataset name matches what was provisioned. For prd, add:

```toml
[[env.prd.analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "lab_events_prd"
```

### Step 3 — Wire the real CF Analytics Engine read API

`queryMonthlyCounter()` in `cost-estimator.ts` currently returns `0`. Replace
it with a call to the CF Analytics Engine GraphQL API:

```typescript
async function queryMonthlyCounter(env: Env): Promise<number> {
  const resp = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/analytics_engine/sql",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `SELECT SUM(_sample_interval) as count
                FROM lab_events
                WHERE timestamp >= toStartOfMonth(now())`,
      }),
    },
  );
  const data = (await resp.json()) as { data: [{ count: number }] };
  return data.data[0]?.count ?? 0;
}
```

Add `CF_API_TOKEN` (read-only Analytics Engine scope) to the lab Worker's
secrets via `wrangler secret put CF_API_TOKEN --env dev`.

### Step 4 — Write a telemetry event per run

In `apps/lab/src/routes/run.ts`, after a run completes, write to Analytics
Engine via the `ANALYTICS` binding:

```typescript
env.ANALYTICS.writeDataPoint({
  blobs: [sessionId, pathId],
  doubles: [durationMs, messageCount],
  indexes: [sessionId],
});
```

## When to close

Close once: (a) dataset provisioned in CF dashboard, (b) `queryMonthlyCounter`
uses the real GraphQL API, (c) telemetry events are written per lab run, and
(d) the $50 kill-switch trigger fires correctly in a staging test.
