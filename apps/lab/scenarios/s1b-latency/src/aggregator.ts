/**
 * Per-path latency summary — Task 3.5
 *
 * `summarize(pathId, events, wallMs)` → PathLatencySummary
 *
 * Consumes MessageDeliveredEvents from a path run, builds a Histogram,
 * computes p50/p95/p99/throughput, and annotates with a cost-per-million
 * estimate from PricingTable.
 */
import { Histogram, PRICING_TABLE, calculateCost, isPriceStale } from "@repo/lab-core";
import type { MessageDeliveredEvent, PathFailedEvent, ScenarioEvent } from "@repo/lab-core";

export type PathStatus = "OK" | "PARTIAL" | "FAILED";

export interface PathLatencySummary {
  pathId: string;
  delivered: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  throughputPerSec: number;
  costPerMillion: number;
  pricingEffectiveDate: string;
  pricingSource: string;
  pricingStaleWarning: string | null;
  status: PathStatus;
}

/**
 * Maps a pathId prefix to the PricingTable service name.
 * Falls back to CF Workers requests if unknown.
 */
function resolvePriceEntry(pathId: string) {
  if (pathId.includes("cf-queues")) {
    return PRICING_TABLE.find((e) => e.service === "CF Queues messages");
  }
  // PgPolling and DirectNotify use Hyperdrive (free hop) + Postgres egress
  return PRICING_TABLE.find((e) => e.service === "Postgres egress (Neon)");
}

function computePricing(
  pathId: string,
  count: number,
): {
  effectiveDate: string;
  pricingSource: string;
  costPerMillion: number;
  pricingStaleWarning: string | null;
} {
  const entry = resolvePriceEntry(pathId);
  const effectiveDate = entry?.effectiveDate ?? "2024-09-01";
  const pricingSource = entry?.source ?? "unknown";
  const totalCost = entry !== undefined ? calculateCost(entry, count) : 0;
  const costPerMillion = count > 0 ? (totalCost / count) * 1_000_000 : 0;
  const stale = entry !== undefined ? isPriceStale(effectiveDate) : false;
  const pricingStaleWarning = stale
    ? `Pricing entry for "${entry?.service}" is older than 90 days (${effectiveDate}). Review https://developers.cloudflare.com for updates.`
    : null;
  return { effectiveDate, pricingSource, costPerMillion, pricingStaleWarning };
}

function resolveStatus(failed: boolean, count: number): PathStatus {
  if (failed) return "FAILED";
  if (count === 0) return "FAILED";
  return "OK";
}

export function summarize(
  pathId: string,
  events: ScenarioEvent[],
  wallMs: number,
): PathLatencySummary {
  const delivered: MessageDeliveredEvent[] = events.filter(
    (e): e is MessageDeliveredEvent => e.type === "message_delivered" && e.pathId === pathId,
  );
  const failed = events.some(
    (e): e is PathFailedEvent => e.type === "path_failed" && e.pathId === pathId,
  );

  const hist = new Histogram();
  for (const ev of delivered) {
    hist.record(ev.latencyMs);
  }

  const count = delivered.length;
  const p50Ms = hist.percentile(0.5);
  const p95Ms = hist.percentile(0.95);
  const p99Ms = hist.percentile(0.99);
  const throughputPerSec = wallMs > 0 ? (count / wallMs) * 1000 : 0;
  const { effectiveDate, pricingSource, costPerMillion, pricingStaleWarning } = computePricing(
    pathId,
    count,
  );

  return {
    pathId,
    delivered: count,
    p50Ms,
    p95Ms,
    p99Ms,
    throughputPerSec,
    costPerMillion,
    pricingEffectiveDate: effectiveDate,
    pricingSource,
    pricingStaleWarning,
    status: resolveStatus(failed, count),
  };
}
