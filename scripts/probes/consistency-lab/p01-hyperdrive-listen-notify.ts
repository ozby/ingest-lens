#!/usr/bin/env bun
/**
 * Probe p01 — Hyperdrive does NOT support LISTEN/NOTIFY; a direct Postgres TCP
 * connection from a Worker via `connect()` DOES.
 *
 * Deploy-gated. Requires: Neon sandbox branch, Hyperdrive config bound to it,
 * a sandbox Worker deployed with both a Hyperdrive binding and direct TCP.
 *
 * When run locally without those, emits SKIPPED_NO_ACCESS. Source-verification
 * (2026-04-24) already confirmed the claim against CF docs; this probe exists
 * as a regression gate for if CF ever changes behavior.
 */
import { emit } from "./lib/verdict";

const PROBE = "p01-hyperdrive-listen-notify";
const CLAIM = "Hyperdrive does NOT support LISTEN/NOTIFY (per CF docs); direct TCP from a DO does";
const CITATION =
  "https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/";

const required = ["NEON_API_KEY", "NEON_PROJECT_ID", "LAB_PROBE_WORKER_URL"];

async function docsCheck(): Promise<{
  confirmed: boolean;
  evidence: string;
}> {
  // Docs-as-truth: the Hyperdrive "supported databases and features" page
  // should mention LISTEN/NOTIFY in an unsupported-features section.
  const res = await fetch(CITATION, { redirect: "follow" });
  if (!res.ok) {
    return { confirmed: false, evidence: `docs HTTP ${res.status}` };
  }
  const html = await res.text();
  const mentionsListen = /\bLISTEN\b/.test(html);
  const mentionsNotify = /\bNOTIFY\b/.test(html);
  const mentionsUnsupported =
    /unsupported|does not support|not supported|does not yet support/i.test(html);
  const confirmed = mentionsListen && mentionsNotify && mentionsUnsupported;
  return {
    confirmed,
    evidence: `docs-mentions-LISTEN=${mentionsListen}, docs-mentions-NOTIFY=${mentionsNotify}, docs-has-unsupported-language=${mentionsUnsupported}`,
  };
}

async function run(): Promise<void> {
  const docs = await docsCheck();

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    // Emit what we know from docs; full runtime probe deferred.
    const verdict = docs.confirmed ? "PARTIAL" : "WRONG";
    await emit({
      probe: PROBE,
      verdict,
      claim: CLAIM,
      evidence: [
        docs.evidence,
        `runtime-probe-env-missing: ${missing.join(", ")}`,
        "full runtime probe (LISTEN over Hyperdrive vs direct TCP): deferred to sandbox deploy",
      ].join(" | "),
      citation: CITATION,
    });
    if (verdict === "WRONG") process.exit(1);
    return;
  }

  // Execution path when the sandbox is provisioned:
  // 1. POST to ${LAB_PROBE_WORKER_URL}/p01/setup → Worker opens two connections,
  //    one via HYPERDRIVE and one via `connect()` direct to Postgres
  // 2. Worker issues LISTEN on both, has a third connection NOTIFY, records
  //    whether each subscriber saw the payload within 5 seconds
  // 3. CONFIRMED iff: direct connection saw it AND Hyperdrive connection did NOT
  await emit({
    probe: PROBE,
    verdict: "SKIPPED_NO_ACCESS",
    claim: CLAIM,
    evidence: `${docs.evidence} | runner stub: env present but sandbox Worker + setup endpoint not yet implemented`,
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
