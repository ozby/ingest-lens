/**
 * CostEstimatorCron — scheduled Worker that estimates CF/Neon spend.
 *
 * Reads Workers Analytics Engine (`ANALYTICS` binding) counters:
 *   cf_queues_messages, do_requests, worker_requests, hyperdrive_queries
 * Multiplies by PricingTable entries (F9T: no CF GraphQL billing API).
 * Caches the last estimate in KV; only recomputes every 3rd tick (≈45 min, F-13).
 * Posts alerts at $5 / $10 / $20 / $50 thresholds (per-tier per-day idempotence via KV).
 * At $50, calls KillSwitchKV.flip() with autoResetAt=next UTC midnight (F-01).
 */

import { PRICING_TABLE, KillSwitchKV } from "@repo/lab-core";
import type { PriceEntry } from "@repo/lab-core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsCounters {
  cf_queues_messages: number;
  do_requests: number;
  worker_requests: number;
  hyperdrive_queries: number;
}

export interface AnalyticsEngineReader {
  /** Query sum of a named counter for the current month (since UTC midnight of month start). */
  queryMonthlyCounter(metric: string): Promise<number>;
}

export interface CostEstimatorKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface CostEstimatorWebhook {
  send(url: string, payload: unknown): Promise<void>;
}

export interface CostEstimatorDeps {
  analytics: AnalyticsEngineReader;
  kv: CostEstimatorKV;
  killSwitch: KillSwitchKV;
  webhookUrl?: string;
  webhook?: CostEstimatorWebhook;
  /** Injectable ISO8601 now for deterministic tests */
  now?: string;
  /** Injectable pricing table (default: PRICING_TABLE) */
  pricingTable?: PriceEntry[];
}

// KV keys
const CACHE_KEY = "lab:cost-estimate:cache";
const TICK_COUNT_KEY = "lab:cost-estimate:tick";
const ALERT_KEY_PREFIX = "lab:cost-alert:";

const CACHE_TICKS = 3; // recompute every 3rd tick

export interface CostEstimate {
  totalUsd: number;
  breakdown: Record<string, number>;
  computedAt: string; // ISO8601
}

const ALERT_TIERS: Array<{ threshold: number; label: string }> = [
  { threshold: 5, label: "tier-1" },
  { threshold: 10, label: "tier-2" },
  { threshold: 20, label: "tier-3" },
  { threshold: 50, label: "tier-4" },
];

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Compute current-month cost estimate from Analytics Engine counters.
 */
export async function computeEstimate(
  analytics: AnalyticsEngineReader,
  pricingTable: PriceEntry[],
  now: string,
): Promise<CostEstimate> {
  const counters: AnalyticsCounters = {
    cf_queues_messages: await analytics.queryMonthlyCounter("cf_queues_messages"),
    do_requests: await analytics.queryMonthlyCounter("do_requests"),
    worker_requests: await analytics.queryMonthlyCounter("worker_requests"),
    hyperdrive_queries: await analytics.queryMonthlyCounter("hyperdrive_queries"),
  };

  const queuesEntry = pricingTable.find((e) => e.service.includes("CF Queues"));
  const doEntry = pricingTable.find(
    (e) => e.service.includes("Durable Object") || e.service.includes("DO"),
  );
  const workerEntry = pricingTable.find(
    (e) => e.service.includes("Worker") && !e.service.includes("Queue"),
  );

  const breakdown: Record<string, number> = {};

  if (queuesEntry) {
    const cost =
      Math.max(0, counters.cf_queues_messages - queuesEntry.freePerMonth) * queuesEntry.priceUsd;
    breakdown["CF Queues"] = cost;
  }
  if (doEntry) {
    const cost = Math.max(0, counters.do_requests - doEntry.freePerMonth) * doEntry.priceUsd;
    breakdown["Durable Objects"] = cost;
  }
  if (workerEntry) {
    const cost =
      Math.max(0, counters.worker_requests - workerEntry.freePerMonth) * workerEntry.priceUsd;
    breakdown["Workers"] = cost;
  }
  // hyperdrive_queries — no per-query charge (probe p14), so cost = 0
  breakdown["Hyperdrive"] = 0;

  const totalUsd = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return { totalUsd, breakdown, computedAt: now };
}

/**
 * Get or compute the estimate, respecting the 3-tick cache (F-13).
 * Returns null if analytics query failed (fail-safe).
 */
export async function getOrComputeEstimate(deps: CostEstimatorDeps): Promise<CostEstimate | null> {
  const now = deps.now ?? new Date().toISOString();
  const pricingTable = deps.pricingTable ?? PRICING_TABLE;

  // Increment tick counter
  const rawTick = await deps.kv.get(TICK_COUNT_KEY);
  const tick = rawTick ? parseInt(rawTick, 10) : 0;
  const newTick = tick + 1;
  await deps.kv.put(TICK_COUNT_KEY, String(newTick));

  // Check cache hit: if not the 3rd tick, return cached estimate
  if (newTick % CACHE_TICKS !== 0) {
    const cached = await deps.kv.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as CostEstimate;
    }
    // No cached value yet — fall through to compute
  }

  try {
    const estimate = await computeEstimate(deps.analytics, pricingTable, now);
    await deps.kv.put(CACHE_KEY, JSON.stringify(estimate));
    return estimate;
  } catch {
    // Analytics query error — fail-safe: no alert, no flip
    return null;
  }
}

/**
 * Compute next UTC midnight from a given ISO8601 timestamp.
 */
export function nextUtcMidnight(now: string): string {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/**
 * Returns the UTC date string (YYYY-MM-DD) for per-tier per-day idempotence keys.
 */
function utcDateStr(now: string): string {
  return now.slice(0, 10);
}

/**
 * Run a cost estimator tick. Returns the estimate (or null on analytics error).
 */
export async function runCostEstimator(deps: CostEstimatorDeps): Promise<CostEstimate | null> {
  const now = deps.now ?? new Date().toISOString();
  const estimate = await getOrComputeEstimate(deps);

  if (estimate === null) return null;

  const dateStr = utcDateStr(now);

  for (const tier of ALERT_TIERS) {
    if (estimate.totalUsd >= tier.threshold) {
      // Per-tier per-day idempotence: only alert once per threshold per UTC day
      const alertKey = `${ALERT_KEY_PREFIX}${tier.label}:${dateStr}`;
      const alreadyAlerted = await deps.kv.get(alertKey);
      if (!alreadyAlerted) {
        await deps.kv.put(alertKey, "1");

        if (deps.webhookUrl && deps.webhook) {
          await deps.webhook.send(deps.webhookUrl, {
            alert: `cost_threshold_${tier.label}`,
            threshold: tier.threshold,
            estimatedUsd: estimate.totalUsd,
            breakdown: estimate.breakdown,
            timestamp: now,
          });
        }

        // At $50 threshold: flip kill switch with auto-reset at next UTC midnight (F-01)
        if (tier.threshold === 50) {
          await deps.killSwitch.flip({
            enabled: false,
            reason: "cost-ceiling",
            autoResetAt: nextUtcMidnight(now),
            now,
          });
        }
      }
    }
  }

  return estimate;
}
