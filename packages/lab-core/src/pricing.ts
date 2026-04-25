/**
 * PricingTable — static CF unit prices pinned with effectiveDate and source.
 *
 * Note (probe p14): Hyperdrive has NO per-query charge — it is a free hop
 * over the underlying Postgres connection. So Hyperdrive itself is omitted.
 *
 * Staleness warning: if effectiveDate is > 90 days ago, consumers should log a
 * warning to prompt a manual price review.
 */

export interface PriceEntry {
  service: string;
  unit: string;
  priceUsd: number; // per unit
  freePerMonth: number; // 0 if no free tier
  effectiveDate: string; // ISO8601 date
  source: string; // URL of the pricing page consulted
}

export const PRICING_TABLE: PriceEntry[] = [
  {
    service: "CF Queues messages",
    unit: "per message",
    priceUsd: 0.4 / 1_000_000, // $0.40 per million → $4e-7 per message
    freePerMonth: 1_000_000,
    effectiveDate: "2024-09-01",
    source: "https://developers.cloudflare.com/queues/platform/pricing/",
  },
  {
    service: "CF Workers requests",
    unit: "per request",
    priceUsd: 0.3 / 1_000_000, // $0.30 per million → $3e-7 per request
    freePerMonth: 10_000_000,
    effectiveDate: "2024-09-01",
    source: "https://developers.cloudflare.com/workers/platform/pricing/",
  },
  {
    service: "CF Durable Objects requests",
    unit: "per request",
    priceUsd: 0.15 / 1_000_000, // $0.15 per million → $1.5e-7 per request
    freePerMonth: 1_000_000,
    effectiveDate: "2024-09-01",
    source: "https://developers.cloudflare.com/durable-objects/platform/pricing/",
  },
  {
    service: "CF Durable Objects duration",
    unit: "per GB-second",
    priceUsd: 0.0000125,
    freePerMonth: 400_000, // 400k GB-seconds
    effectiveDate: "2024-09-01",
    source: "https://developers.cloudflare.com/durable-objects/platform/pricing/",
  },
  {
    service: "Postgres egress (Neon)",
    unit: "per GB",
    priceUsd: 0.09,
    freePerMonth: 0,
    effectiveDate: "2024-09-01",
    source: "https://neon.tech/pricing",
  },
];

/**
 * Returns true if the given effectiveDate is more than 90 days in the past
 * relative to today, indicating a stale price entry.
 */
export function isPriceStale(effectiveDate: string, today: Date = new Date()): boolean {
  const effective = new Date(effectiveDate);
  const diffMs = today.getTime() - effective.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 90;
}

/**
 * Returns cost in USD for a given number of units beyond the free tier.
 * Returns 0 if within free tier.
 */
export function calculateCost(entry: PriceEntry, units: number): number {
  const billableUnits = Math.max(0, units - entry.freePerMonth);
  return billableUnits * entry.priceUsd;
}

/**
 * Returns a staleness warning message for any entries older than 90 days,
 * or null if all entries are fresh.
 */
export function checkStaleness(
  table: PriceEntry[] = PRICING_TABLE,
  today: Date = new Date(),
): string | null {
  const stale = table.filter((e) => isPriceStale(e.effectiveDate, today));
  if (stale.length === 0) return null;
  const names = stale.map((e) => `${e.service} (${e.effectiveDate})`).join(", ");
  return `Stale pricing entries (>90 days): ${names}. Please review and update.`;
}
