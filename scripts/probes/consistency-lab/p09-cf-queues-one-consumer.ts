#!/usr/bin/env bun
/**
 * Probe p09 — When a second Worker declares a `[[queues.consumers]]` binding
 * for a queue that already has a consumer Worker, what actually happens?
 *
 * Source verification found no CF doc that says "second consumer is rejected
 * at publish time". The actual behavior (reject vs silent-replace) needs a
 * real wrangler deploy to observe. Deploy-gated.
 */
import { emit } from "./lib/verdict";

const PROBE = "p09-cf-queues-one-consumer";
const CLAIM =
  "Exactly one consumer Worker binding per queue in wrangler.toml; second binding is rejected or silently replaces";
const CITATION = "https://developers.cloudflare.com/queues/configuration/consumer-concurrency/";

const required = ["CF_API_TOKEN", "CF_ACCOUNT_ID", "LAB_PROBE_QUEUE_NAME"];

async function run(): Promise<void> {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    await emit({
      probe: PROBE,
      verdict: "SKIPPED_NO_ACCESS",
      claim: CLAIM,
      evidence: `missing env: ${missing.join(", ")}`,
      citation: CITATION,
    });
    return;
  }
  await emit({
    probe: PROBE,
    verdict: "SKIPPED_NO_ACCESS",
    claim: CLAIM,
    evidence:
      "runner stub: env present but two-worker deploy + reject-vs-replace observation not yet implemented",
    citation: CITATION,
  });
}

run().catch(async (err) => {
  await emit({
    probe: PROBE,
    verdict: "UNREACHABLE",
    claim: CLAIM,
    evidence: `threw: ${err instanceof Error ? err.message : String(err)}`,
    citation: CITATION,
  });
  process.exit(2);
});
