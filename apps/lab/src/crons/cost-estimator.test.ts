import { describe, it, expect, vi } from "vitest";
import { runCostEstimator, computeEstimate, nextUtcMidnight } from "./cost-estimator";
import type { CostEstimatorDeps, AnalyticsEngineReader, CostEstimatorKV } from "./cost-estimator";
import { KillSwitchKV } from "@repo/lab-core";
import type { KVNamespace, PriceEntry } from "@repo/lab-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockKV(): CostEstimatorKV & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function createMockKillSwitchKV(kv: KVNamespace): KillSwitchKV {
  return new KillSwitchKV(kv);
}

function createMockKillSwitchKVNamespace(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

// Pinned pricing table for deterministic tests
const PINNED_PRICING: PriceEntry[] = [
  {
    service: "CF Queues messages",
    unit: "per message",
    priceUsd: 0.4 / 1_000_000,
    freePerMonth: 1_000_000,
    effectiveDate: "2024-09-01",
    source: "https://developers.cloudflare.com/queues/platform/pricing",
  },
  {
    service: "Durable Object requests",
    unit: "per million requests",
    priceUsd: 0.15 / 1_000_000,
    freePerMonth: 1_000_000,
    effectiveDate: "2024-09-01",
    source: "https://developers.cloudflare.com/durable-objects/platform/pricing",
  },
  {
    service: "Workers requests",
    unit: "per million requests",
    priceUsd: 0.3 / 1_000_000,
    freePerMonth: 10_000_000,
    effectiveDate: "2024-09-01",
    source: "https://developers.cloudflare.com/workers/platform/pricing",
  },
];

function makeAnalytics(counters: {
  cf_queues_messages: number;
  do_requests: number;
  worker_requests: number;
  hyperdrive_queries: number;
}): AnalyticsEngineReader {
  return {
    async queryMonthlyCounter(metric: string): Promise<number> {
      return counters[metric as keyof typeof counters] ?? 0;
    },
  };
}

function makeDeps(overrides: Partial<CostEstimatorDeps> = {}): CostEstimatorDeps {
  const ksKv = createMockKillSwitchKVNamespace();
  return {
    analytics: makeAnalytics({
      cf_queues_messages: 0,
      do_requests: 0,
      worker_requests: 0,
      hyperdrive_queries: 0,
    }),
    kv: createMockKV(),
    killSwitch: createMockKillSwitchKV(ksKv),
    webhookUrl: "https://hooks.example.com/cost",
    webhook: { send: vi.fn().mockResolvedValue(undefined) },
    now: "2026-01-15T12:00:00.000Z",
    pricingTable: PINNED_PRICING,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeEstimate
// ---------------------------------------------------------------------------

describe("computeEstimate", () => {
  it("returns totalUsd=0 when all counters are within free tier", async () => {
    const analytics = makeAnalytics({
      cf_queues_messages: 500_000,
      do_requests: 500_000,
      worker_requests: 5_000_000,
      hyperdrive_queries: 1_000,
    });
    const estimate = await computeEstimate(analytics, PINNED_PRICING, "2026-01-15T00:00:00.000Z");
    expect(estimate.totalUsd).toBe(0);
  });

  it("calculates cost correctly when counters exceed free tier", async () => {
    const analytics = makeAnalytics({
      cf_queues_messages: 2_000_000, // 1M billable → $0.40
      do_requests: 0,
      worker_requests: 0,
      hyperdrive_queries: 0,
    });
    const estimate = await computeEstimate(analytics, PINNED_PRICING, "2026-01-15T00:00:00.000Z");
    expect(estimate.totalUsd).toBeCloseTo(0.4, 5);
    expect(estimate.breakdown["CF Queues"]).toBeCloseTo(0.4, 5);
  });

  it("hyperdrive is always $0 (no per-query charge, probe p14)", async () => {
    const analytics = makeAnalytics({
      cf_queues_messages: 0,
      do_requests: 0,
      worker_requests: 0,
      hyperdrive_queries: 1_000_000,
    });
    const estimate = await computeEstimate(analytics, PINNED_PRICING, "2026-01-15T00:00:00.000Z");
    expect(estimate.breakdown["Hyperdrive"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runCostEstimator — alert thresholds
// ---------------------------------------------------------------------------

describe("runCostEstimator — spend at $4.99 → no alert", () => {
  it("does not send any webhook or flip kill switch", async () => {
    // $4.99 = 4.99/0.4 * 1M + 1M = ~13.475M messages
    const analytics = makeAnalytics({
      cf_queues_messages: 13_475_000, // ≈$4.99
      do_requests: 0,
      worker_requests: 0,
      hyperdrive_queries: 0,
    });
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };
    const ksKv = createMockKillSwitchKVNamespace();
    const deps = makeDeps({ analytics, webhook, killSwitch: createMockKillSwitchKV(ksKv) });
    const estimate = await runCostEstimator(deps);
    expect(estimate).not.toBeNull();
    expect(estimate!.totalUsd).toBeLessThan(5);
    expect(webhook.send).not.toHaveBeenCalled();
    expect(ksKv._store.has("lab:kill-switch")).toBe(false);
  });
});

describe("runCostEstimator — spend at $5.01 → tier-1 alert", () => {
  it("sends tier-1 webhook alert", async () => {
    const analytics = makeAnalytics({
      cf_queues_messages: 13_527_500, // ≈$5.01
      do_requests: 0,
      worker_requests: 0,
      hyperdrive_queries: 0,
    });
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };
    const deps = makeDeps({ analytics, webhook });
    await runCostEstimator(deps);
    expect(webhook.send).toHaveBeenCalledTimes(1);
    const [, payload] = webhook.send.mock.calls[0] as [string, { alert: string }];
    expect(payload.alert).toBe("cost_threshold_tier-1");
  });
});

describe("runCostEstimator — per-tier per-day idempotence", () => {
  it("does not send duplicate alert on same tier same day", async () => {
    const analytics = makeAnalytics({
      cf_queues_messages: 13_527_500, // ≈$5.01
      do_requests: 0,
      worker_requests: 0,
      hyperdrive_queries: 0,
    });
    const kv = createMockKV();
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };
    const deps = makeDeps({ analytics, kv, webhook });

    // First run — alert fires
    await runCostEstimator(deps);
    expect(webhook.send).toHaveBeenCalledTimes(1);

    // Reset tick counter so recomputation happens again
    kv._store.delete("lab:cost-estimate:tick");
    kv._store.delete(CACHE_KEY_FOR_RESET);

    // Second run — same day, same tier — no duplicate
    await runCostEstimator(deps);
    expect(webhook.send).toHaveBeenCalledTimes(1);
  });
});

// We need a way to reference the cache key for the idempotence test reset.
const CACHE_KEY_FOR_RESET = "lab:cost-estimate:cache";

describe("runCostEstimator — $50.01 → tier-4 alert + kill switch flip", () => {
  it("fires tier-4 webhook and flips kill switch with autoResetAt", async () => {
    // $50.01 ≈ 126M messages (50.01/0.4 * 1M + 1M)
    const analytics = makeAnalytics({
      cf_queues_messages: 126_025_000,
      do_requests: 0,
      worker_requests: 0,
      hyperdrive_queries: 0,
    });
    const ksKv = createMockKillSwitchKVNamespace();
    const killSwitch = createMockKillSwitchKV(ksKv);
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };
    const deps = makeDeps({
      analytics,
      killSwitch,
      webhook,
      now: "2026-01-15T12:00:00.000Z",
    });

    await runCostEstimator(deps);

    // Kill switch should be flipped
    const ksRaw = ksKv._store.get("lab:kill-switch");
    expect(ksRaw).toBeDefined();
    const ksState = JSON.parse(ksRaw!) as { enabled: boolean; reason: string; autoResetAt: string };
    expect(ksState.enabled).toBe(false);
    expect(ksState.reason).toBe("cost-ceiling");
    expect(ksState.autoResetAt).toBe("2026-01-16T00:00:00.000Z");
  });
});

describe("runCostEstimator — analytics query error", () => {
  it("returns null and does not alert or flip", async () => {
    const failingAnalytics: AnalyticsEngineReader = {
      async queryMonthlyCounter(_metric: string): Promise<number> {
        throw new Error("Analytics Engine unavailable");
      },
    };
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };
    const ksKv = createMockKillSwitchKVNamespace();
    const deps = makeDeps({
      analytics: failingAnalytics,
      webhook,
      killSwitch: createMockKillSwitchKV(ksKv),
    });

    const result = await runCostEstimator(deps);
    expect(result).toBeNull();
    expect(webhook.send).not.toHaveBeenCalled();
    expect(ksKv._store.has("lab:kill-switch")).toBe(false);
  });
});

describe("runCostEstimator — cache hit within 45-min window (F-13)", () => {
  it("uses cached estimate on non-3rd ticks without re-querying analytics", async () => {
    const analytics = makeAnalytics({
      cf_queues_messages: 2_000_000,
      do_requests: 0,
      worker_requests: 0,
      hyperdrive_queries: 0,
    });
    const querySpy = vi.spyOn(analytics, "queryMonthlyCounter");
    const kv = createMockKV();
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };

    // Tick 3 — computes and caches (3 % 3 === 0)
    const deps3 = makeDeps({ analytics, kv, webhook });
    // pre-seed tick to 2 so next increment = 3
    kv._store.set("lab:cost-estimate:tick", "2");
    await runCostEstimator(deps3);
    const computeCallsAfterTick3 = querySpy.mock.calls.length;
    expect(computeCallsAfterTick3).toBeGreaterThan(0);

    querySpy.mockClear();

    // Tick 4 — cache hit (4 % 3 !== 0)
    const deps4 = makeDeps({ analytics, kv, webhook });
    await runCostEstimator(deps4);
    // Analytics should NOT have been queried (cache hit)
    expect(querySpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// nextUtcMidnight
// ---------------------------------------------------------------------------

describe("nextUtcMidnight", () => {
  it("returns the next UTC midnight from a given time", () => {
    expect(nextUtcMidnight("2026-01-15T12:00:00.000Z")).toBe("2026-01-16T00:00:00.000Z");
  });

  it("returns next midnight even at 23:59", () => {
    expect(nextUtcMidnight("2026-01-15T23:59:00.000Z")).toBe("2026-01-16T00:00:00.000Z");
  });
});
