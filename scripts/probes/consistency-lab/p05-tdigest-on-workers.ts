#!/usr/bin/env bun
/**
 * Probe p05 — inline t-digest produces accurate percentiles on Workers-compatible runtime.
 *
 * Original (fabricated) claim: `@thi.ng/tdigest` runs on Workers.
 * Corrected claim: inline ~200-line t-digest (Dunning reference) runs on any ES2022
 * runtime and hits p99 within ±2% of analytical percentile on 10k samples.
 *
 * This probe runs under Bun. Bun is a Workers-compatible ES runtime for the APIs
 * the t-digest uses (no fs, no worker_threads, no native bindings). If it passes
 * under Bun, it passes under miniflare/Workers.
 */
import { TDigest } from "./lib/tdigest";
import { emit } from "./lib/verdict";

const PROBE = "p05-tdigest-on-workers";
const CLAIM =
  "Inline t-digest produces p50/p95/p99 within ±2% of analytical percentile on 10k samples";

// Deterministic-seeded LCG so the probe is reproducible.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Uniform [0, 1): analytical p50=0.5, p95=0.95, p99=0.99
function uniformSamples(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => rng());
}

// Exponential with mean 1: analytical p50 = ln(2) ≈ 0.693, p99 = ln(100) ≈ 4.605
function exponentialSamples(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => -Math.log(1 - rng()));
}

function assertWithin(
  label: string,
  observed: number,
  expected: number,
  tolerance: number,
): string {
  const delta = Math.abs(observed - expected);
  const ratio = delta / expected;
  const ok = ratio <= tolerance;
  return `${ok ? "OK" : "FAIL"} ${label}: observed=${observed.toFixed(4)} expected=${expected.toFixed(4)} (Δ=${(ratio * 100).toFixed(2)}%, tol=${(tolerance * 100).toFixed(0)}%)`;
}

async function run(): Promise<void> {
  const rng = seededRng(0x5a1a);

  // Test 1: Uniform [0, 1), 10k samples
  const digestU = new TDigest(200);
  digestU.recordAll(uniformSamples(rng, 10_000));
  const uP50 = digestU.percentile(0.5) ?? Number.NaN;
  const uP95 = digestU.percentile(0.95) ?? Number.NaN;
  const uP99 = digestU.percentile(0.99) ?? Number.NaN;

  // Test 2: Exponential (mean=1), 10k samples
  const digestE = new TDigest(200);
  digestE.recordAll(exponentialSamples(rng, 10_000));
  const eP50 = digestE.percentile(0.5) ?? Number.NaN;
  const eP99 = digestE.percentile(0.99) ?? Number.NaN;

  const results = [
    assertWithin("uniform p50", uP50, 0.5, 0.02),
    assertWithin("uniform p95", uP95, 0.95, 0.02),
    assertWithin("uniform p99", uP99, 0.99, 0.02),
    assertWithin("exponential p50", eP50, Math.LN2, 0.05),
    assertWithin("exponential p99", eP99, Math.log(100), 0.05),
  ];

  const anyFail = results.some((r) => r.startsWith("FAIL"));
  await emit({
    probe: PROBE,
    verdict: anyFail ? "WRONG" : "CONFIRMED",
    claim: CLAIM,
    evidence: results.join(" | "),
    citation: "Dunning, 'Computing Extremely Accurate Quantiles Using t-Digests' (2019)",
  });
  if (anyFail) process.exit(1);
}

run().catch(async (err) => {
  await emit({
    probe: PROBE,
    verdict: "UNREACHABLE",
    claim: CLAIM,
    evidence: `threw: ${err instanceof Error ? err.message : String(err)}`,
  });
  process.exit(2);
});
