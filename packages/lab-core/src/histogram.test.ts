import { describe, it, expect } from "vitest";
import { Histogram } from "./histogram";

// ---------------------------------------------------------------------------
// Deterministic seeded RNG (same as probe p05)
// ---------------------------------------------------------------------------

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function uniformSamples(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => rng());
}

function gaussianSamples(rng: () => number, n: number): number[] {
  // Box-Muller transform: mean=0, stddev=1
  const out: number[] = [];
  for (let i = 0; i < n; i += 2) {
    const u1 = rng();
    const u2 = rng();
    const z0 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.sin(2 * Math.PI * u2);
    out.push(z0);
    if (i + 1 < n) out.push(z1);
  }
  return out;
}

function paretoSamples(rng: () => number, n: number, alpha = 1.5): number[] {
  // Pareto: heavy tail; F^-1(u) = (1 - u)^(-1/alpha)
  return Array.from({ length: n }, () => Math.pow(1 - rng(), -1 / alpha));
}

describe("Histogram", () => {
  describe("percentile accuracy on 10k samples", () => {
    it("uniform [0,1]: p50, p95, p99 within ±2% of analytical values", () => {
      const rng = seededRng(0x5a1a);
      const h = new Histogram(200);
      h.recordAll(uniformSamples(rng, 10_000));

      const p50 = h.percentile(0.5)!;
      const p95 = h.percentile(0.95)!;
      const p99 = h.percentile(0.99)!;

      expect(Math.abs(p50 - 0.5) / 0.5).toBeLessThanOrEqual(0.02);
      expect(Math.abs(p95 - 0.95) / 0.95).toBeLessThanOrEqual(0.02);
      expect(Math.abs(p99 - 0.99) / 0.99).toBeLessThanOrEqual(0.02);
    });

    it("Gaussian (mean=0, stddev=1): p50 near 0, p99 near 2.326", () => {
      const rng = seededRng(0xbeef);
      const h = new Histogram(200);
      h.recordAll(gaussianSamples(rng, 10_000));

      const p50 = h.percentile(0.5)!;
      const p99 = h.percentile(0.99)!;

      // p50 of standard normal ≈ 0 (within 0.05 absolute)
      expect(Math.abs(p50)).toBeLessThanOrEqual(0.05);
      // p99 of standard normal ≈ 2.326 — allow ±5% for heavy-tail
      const analyticalP99 = 2.326;
      expect(Math.abs(p99 - analyticalP99) / analyticalP99).toBeLessThanOrEqual(0.05);
    });

    it("Pareto (alpha=1.5): count is correct after record", () => {
      const rng = seededRng(0xcafe);
      const h = new Histogram(200);
      const samples = paretoSamples(rng, 10_000);
      h.recordAll(samples);
      expect(h.count()).toBe(10_000);
    });
  });

  describe("edge cases", () => {
    it("empty histogram returns null for percentile without throwing", () => {
      const h = new Histogram();
      expect(h.percentile(0.5)).toBeNull();
      expect(h.percentile(0)).toBeNull();
      expect(h.percentile(1)).toBeNull();
    });

    it("throws RangeError for compression < 20", () => {
      expect(() => new Histogram(19)).toThrow(RangeError);
    });

    it("throws RangeError for p outside [0, 1]", () => {
      const h = new Histogram();
      h.record(1);
      expect(() => h.percentile(-0.01)).toThrow(RangeError);
      expect(() => h.percentile(1.01)).toThrow(RangeError);
    });

    it("ignores non-finite values", () => {
      const h = new Histogram();
      h.record(Number.NaN);
      h.record(Number.POSITIVE_INFINITY);
      h.record(Number.NEGATIVE_INFINITY);
      expect(h.count()).toBe(0);
    });

    it("single sample: percentile returns that sample", () => {
      const h = new Histogram();
      h.record(42);
      expect(h.percentile(0.5)).toBe(42);
    });
  });

  describe("merge", () => {
    it("merge is commutative: A.merge(B) equals B.merge(A) in count", () => {
      const rng = seededRng(0x1234);
      const samplesA = uniformSamples(rng, 1000);
      const samplesB = uniformSamples(rng, 1000);

      const hA1 = new Histogram(200);
      hA1.recordAll(samplesA);
      const hB1 = new Histogram(200);
      hB1.recordAll(samplesB);
      hA1.merge(hB1);

      const hA2 = new Histogram(200);
      hA2.recordAll(samplesA);
      const hB2 = new Histogram(200);
      hB2.recordAll(samplesB);
      hB2.merge(hA2);

      expect(hA1.count()).toBe(hB2.count());
      expect(hA1.count()).toBe(2000);
    });

    it("merging two histograms produces accurate percentiles", () => {
      const rng = seededRng(0xabcd);
      const h1 = new Histogram(200);
      h1.recordAll(uniformSamples(rng, 5000));
      const h2 = new Histogram(200);
      h2.recordAll(uniformSamples(rng, 5000));
      h1.merge(h2);
      const p50 = h1.percentile(0.5)!;
      expect(Math.abs(p50 - 0.5) / 0.5).toBeLessThanOrEqual(0.02);
    });

    it("merge with empty histogram is a no-op", () => {
      const h = new Histogram();
      h.record(5);
      const empty = new Histogram();
      h.merge(empty);
      expect(h.count()).toBe(1);
      expect(h.percentile(0.5)).toBe(5);
    });
  });
});
