#!/usr/bin/env bun
/**
 * Probe p14 — Hyperdrive pricing. Lane A's `PricingTable` had a
 * "Hyperdrive write" cost line; the actual pricing model should be
 * verified so scenario 1b latency/cost reports accurate numbers.
 *
 * As of last CF pricing check, Hyperdrive itself is free during beta/GA
 * rollout — you pay the underlying database. If that's still true, the
 * PricingTable should not include a separate Hyperdrive unit cost.
 */
import { emit } from "./lib/verdict";

const PROBE = "p14-hyperdrive-pricing";
const CLAIM = "Hyperdrive has no per-query charge; cost flows through to the underlying database";
const URL = "https://developers.cloudflare.com/hyperdrive/platform/pricing/";

async function run(): Promise<void> {
  const res = await fetch(URL, { redirect: "follow" });
  if (!res.ok) {
    // Fallback: try the general Workers pricing page
    const fallback = await fetch("https://developers.cloudflare.com/workers/platform/pricing/", {
      redirect: "follow",
    });
    if (!fallback.ok) {
      await emit({
        probe: PROBE,
        verdict: "UNREACHABLE",
        claim: CLAIM,
        evidence: `hyperdrive docs ${res.status}; workers pricing ${fallback.status}`,
        citation: URL,
      });
      process.exit(2);
    }
    const html = await fallback.text();
    const mentionsHyperdrive = /Hyperdrive/i.test(html);
    const mentionsFree = /free|no additional|included/i.test(html);
    await emit({
      probe: PROBE,
      verdict: "PARTIAL",
      claim: CLAIM,
      evidence: [
        `hyperdrive-page-${res.status}-falling-back`,
        `workers-pricing-mentions-Hyperdrive=${mentionsHyperdrive}`,
        `workers-pricing-mentions-free/included=${mentionsFree}`,
      ].join(" | "),
      citation: URL,
    });
    return;
  }
  const html = await res.text();
  const mentionsFree = /\bfree\b|\$0\b|no additional|no charge|no extra/i.test(html);
  const mentionsHyperdrive = /Hyperdrive/i.test(html);
  const mentionsPricing = /\$\d|\bcents?\b|per\s+(request|query|GB|million)/i.test(html);

  // Claim is "no per-query charge", so the page should mention Hyperdrive
  // AND either say free OR not have per-query pricing.
  const confirmed = mentionsHyperdrive && (mentionsFree || !mentionsPricing);

  await emit({
    probe: PROBE,
    verdict: confirmed ? "CONFIRMED" : "PARTIAL",
    claim: CLAIM,
    evidence: [
      `page-mentions-Hyperdrive=${mentionsHyperdrive}`,
      `page-mentions-free/no-charge=${mentionsFree}`,
      `page-mentions-dollar-pricing=${mentionsPricing}`,
    ].join(" | "),
    citation: URL,
  });
}

run().catch(async (err) => {
  await emit({
    probe: PROBE,
    verdict: "UNREACHABLE",
    claim: CLAIM,
    evidence: `threw: ${err instanceof Error ? err.message : String(err)}`,
    citation: URL,
  });
  process.exit(2);
});
