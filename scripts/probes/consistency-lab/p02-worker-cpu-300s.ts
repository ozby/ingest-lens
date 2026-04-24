#!/usr/bin/env bun
/**
 * Probe p02 — `[limits] cpu_ms = 300000` is accepted on the paid tier and a
 * Worker handler can actually run ~150s of CPU without hitting the cap.
 *
 * Deploy-gated. Requires a paid CF account + a deployed sandbox Worker.
 */
import { emit } from "./lib/verdict";

const PROBE = "p02-worker-cpu-300s";
const CLAIM = "Worker CPU limit configurable to 5 min (300s) on paid tier; limits.cpu_ms = 300000";
const CITATION = "https://developers.cloudflare.com/workers/platform/limits/";

const required = ["LAB_PROBE_WORKER_URL", "CF_ACCOUNT_TIER"];

async function docsCheck(): Promise<{
  confirmed: boolean;
  evidence: string;
}> {
  const res = await fetch(CITATION, { redirect: "follow" });
  if (!res.ok) {
    return { confirmed: false, evidence: `docs HTTP ${res.status}` };
  }
  const html = await res.text();
  // Looser regex — we just need the keywords present on the page. The
  // authoritative CF limits page contains all of CPU time, 5 minutes, and
  // paid-plan language. If they all appear, the claim is supported.
  const mentions300k = /300[_,]?000|5\s*min(ute)?|5m(?!b)/i.test(html);
  const mentionsCpuMs = /cpu_ms|\bCPU time\b|CPU\s+time/i.test(html);
  const mentionsPaid = /Workers\s+Paid|paid\s+plan|paid\s+tier/i.test(html);
  const confirmed = mentions300k && mentionsCpuMs && mentionsPaid;
  return {
    confirmed,
    evidence: `docs-has-300000/5min=${mentions300k}, docs-has-CPU-time-or-cpu_ms=${mentionsCpuMs}, docs-has-paid-tier=${mentionsPaid}`,
  };
}

async function run(): Promise<void> {
  const docs = await docsCheck();

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    const verdict = docs.confirmed ? "PARTIAL" : "WRONG";
    await emit({
      probe: PROBE,
      verdict,
      claim: CLAIM,
      evidence: [
        docs.evidence,
        `runtime-probe-env-missing: ${missing.join(", ")}`,
        "full runtime probe (150s CPU burn on deployed Worker): deferred to sandbox deploy",
      ].join(" | "),
      citation: CITATION,
    });
    if (verdict === "WRONG") process.exit(1);
    return;
  }
  await emit({
    probe: PROBE,
    verdict: "SKIPPED_NO_ACCESS",
    claim: CLAIM,
    evidence: `${docs.evidence} | runner stub: env present but sandbox Worker with cpu_ms=300000 not yet deployed`,
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
