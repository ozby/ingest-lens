#!/usr/bin/env bun
/**
 * Probe p10 — Cloudflare does NOT expose a public Worker-callable billing API
 * that's authoritative for daily spend.
 *
 * Negative-existence probe: fetches the CF GraphQL Analytics docs and asserts
 * the explicit "not a measure for billing purposes" disclaimer is present. If
 * CF has since shipped a billing endpoint, we want this probe to fail so
 * Lane E `CostEstimatorCron` can be simplified.
 */
import { emit } from "./lib/verdict";

const PROBE = "p10-cf-billing-api-absence";
const CLAIM =
  "CF GraphQL Analytics is explicitly not authoritative for billing; no public Worker-callable billing API";
const URL = "https://developers.cloudflare.com/analytics/graphql-api/";

async function run(): Promise<void> {
  const res = await fetch(URL);
  if (!res.ok) {
    await emit({
      probe: PROBE,
      verdict: "UNREACHABLE",
      claim: CLAIM,
      evidence: `HTTP ${res.status} from ${URL}`,
      citation: URL,
    });
    process.exit(2);
  }
  const html = await res.text();

  // The authoritative disclaimer, per Cloudflare docs:
  // "These datasets should not be used as a measure for usage that Cloudflare uses for billing purposes."
  const disclaimerRx =
    /not[\s\S]{0,40}(used|measure)[\s\S]{0,120}billing|billable traffic excludes/i;
  const hasDisclaimer = disclaimerRx.test(html);

  // Sanity: "billing" appears at all (otherwise we're likely on the wrong page)
  const mentionsBilling = /billing/i.test(html);

  const verdict = hasDisclaimer && mentionsBilling ? "CONFIRMED" : "PARTIAL";
  const evidence = [
    `billing-disclaimer-found=${hasDisclaimer}`,
    `mentions-billing=${mentionsBilling}`,
    `bytes=${html.length}`,
  ].join(", ");

  await emit({
    probe: PROBE,
    verdict,
    claim: CLAIM,
    evidence,
    citation: URL,
  });
  if (verdict !== "CONFIRMED") process.exit(1);
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
