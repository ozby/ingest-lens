import { describe, it, expect } from "vitest";
import { PRICING_TABLE, isPriceStale, calculateCost, checkStaleness } from "./pricing";

describe("PRICING_TABLE", () => {
  it("contains exactly 5 entries", () => {
    expect(PRICING_TABLE).toHaveLength(5);
  });

  it("every entry has required fields", () => {
    for (const entry of PRICING_TABLE) {
      expect(entry.service).toBeTruthy();
      expect(entry.unit).toBeTruthy();
      expect(typeof entry.priceUsd).toBe("number");
      expect(typeof entry.freePerMonth).toBe("number");
      expect(entry.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.source).toMatch(/^https?:\/\//);
    }
  });

  it("CF Queues entry: 1M messages = $0 within free tier", () => {
    const queues = PRICING_TABLE.find((e) => e.service.includes("CF Queues"))!;
    expect(queues).toBeDefined();
    const cost = calculateCost(queues, 1_000_000);
    expect(cost).toBe(0); // within free tier
  });

  it("CF Queues entry: 2M messages costs $0.40", () => {
    const queues = PRICING_TABLE.find((e) => e.service.includes("CF Queues"))!;
    const cost = calculateCost(queues, 2_000_000);
    expect(cost).toBeCloseTo(0.4, 5);
  });

  it("Hyperdrive is NOT in the pricing table (probe p14: no per-query charge)", () => {
    const hyperdrive = PRICING_TABLE.find((e) => e.service.toLowerCase().includes("hyperdrive"));
    expect(hyperdrive).toBeUndefined();
  });
});

describe("isPriceStale", () => {
  it("returns true when effectiveDate is > 90 days ago", () => {
    const old = "2024-01-01";
    expect(isPriceStale(old, new Date("2026-01-01"))).toBe(true);
  });

  it("returns false when effectiveDate is < 90 days ago", () => {
    const recent = "2025-12-01";
    expect(isPriceStale(recent, new Date("2026-01-01"))).toBe(false);
  });

  it("returns false for today's date", () => {
    const today = "2026-01-01";
    expect(isPriceStale(today, new Date("2026-01-01"))).toBe(false);
  });
});

describe("calculateCost", () => {
  it("returns 0 within free tier", () => {
    const entry = PRICING_TABLE[0]!;
    const cost = calculateCost(entry, entry.freePerMonth);
    expect(cost).toBe(0);
  });

  it("calculates correctly beyond free tier", () => {
    const queues = PRICING_TABLE.find((e) => e.service.includes("CF Queues"))!;
    // 1.5M messages: 500k beyond the 1M free tier → 0.5 * $0.40 = $0.20
    const cost = calculateCost(queues, 1_500_000);
    expect(cost).toBeCloseTo(0.2, 5);
  });

  it("returns 0 for 0 units", () => {
    const entry = PRICING_TABLE[0]!;
    expect(calculateCost(entry, 0)).toBe(0);
  });
});

describe("checkStaleness", () => {
  it("returns null when all entries are fresh (after effectiveDate)", () => {
    const fresh = [
      {
        service: "test",
        unit: "per req",
        priceUsd: 0.1,
        freePerMonth: 0,
        effectiveDate: "2025-12-01",
        source: "https://example.com",
      },
    ];
    const today = new Date("2026-01-01");
    expect(checkStaleness(fresh, today)).toBeNull();
  });

  it("returns warning string when any entry is stale", () => {
    const stale = [
      {
        service: "old service",
        unit: "per req",
        priceUsd: 0.1,
        freePerMonth: 0,
        effectiveDate: "2020-01-01",
        source: "https://example.com",
      },
    ];
    const today = new Date("2026-01-01");
    const warning = checkStaleness(stale, today);
    expect(warning).not.toBeNull();
    expect(warning).toContain("old service");
    expect(warning).toContain("Stale pricing entries");
  });

  it("actual PRICING_TABLE produces staleness warning when today is 2026-01-01", () => {
    // All entries have effectiveDate 2024-09-01, which is > 90 days before 2026-01-01
    const today = new Date("2026-01-01");
    const warning = checkStaleness(PRICING_TABLE, today);
    expect(warning).not.toBeNull();
  });
});
