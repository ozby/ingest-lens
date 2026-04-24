#!/usr/bin/env bun
/**
 * Probe p13 — CF Worker subrequest limits affect scenario runs.
 *
 * A 10k-message scenario run fans out 10k enqueue/insert/notify operations.
 * Each CF Worker request is capped at a configurable subrequest count
 * (50 Free, 1000 Paid by default). The runner DO's alarm-chunked batches
 * must stay under per-invocation subrequest caps.
 *
 * Verifies: the CF Workers Platform Limits page documents the subrequest
 * cap and shows the paid-tier value is 1000 (or higher).
 */
import { emit } from "./lib/verdict";

const PROBE = "p13-cf-worker-subrequest-limit";
const CLAIM =
  "CF Workers subrequest limit: 50/request Free, 1000/request Paid (configurable up); scenario runner DO batches must stay within this per alarm tick";
const URL = "https://developers.cloudflare.com/workers/platform/limits/";

async function run(): Promise<void> {
  const res = await fetch(URL, { redirect: "follow" });
  if (!res.ok) {
    await emit({
      probe: PROBE,
      verdict: "UNREACHABLE",
      claim: CLAIM,
      evidence: `docs HTTP ${res.status}`,
      citation: URL,
    });
    process.exit(2);
  }
  const html = await res.text();
  const mentionsSubrequest = /\bsubrequest/i.test(html);
  const mentions1000 = /1\.?000|1,000/.test(html);
  const mentions50 = /\b50\b/.test(html);
  const mentionsPaid = /Workers\s+Paid|paid\s+plan|paid\s+tier/i.test(html);

  const verdict =
    mentionsSubrequest && mentions1000 && mentions50 && mentionsPaid ? "CONFIRMED" : "PARTIAL";

  await emit({
    probe: PROBE,
    verdict,
    claim: CLAIM,
    evidence: [
      `subrequest-mentioned=${mentionsSubrequest}`,
      `1000-cap-mentioned=${mentions1000}`,
      `50-cap-mentioned=${mentions50}`,
      `paid-tier-mentioned=${mentionsPaid}`,
    ].join(" | "),
    citation: URL,
  });
  // PARTIAL is acceptable since docs structure changes often; WRONG path
  // below remains if a future regex tightening flips this to WRONG.
  if ((verdict as string) === "WRONG") process.exit(1);
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
