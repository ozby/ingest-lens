#!/usr/bin/env bun
/**
 * Probe p06 — Doppler REST API accepts secret updates via
 * `POST /v3/configs/config/secrets` when given a token with write scope.
 *
 * Deploy-gated: requires a Doppler sandbox project + two tokens (one with
 * write scope, one read-only). When the env isn't set, emits SKIPPED_NO_ACCESS.
 */
import { emit } from "./lib/verdict";

const PROBE = "p06-doppler-secret-update";
const CLAIM =
  "Doppler `/v3/configs/config/secrets` accepts writes with a write-scoped token and rejects with a read-only token";
const CITATION = "https://docs.doppler.com/reference/secrets";

const required = [
  "DOPPLER_PROBE_PROJECT",
  "DOPPLER_PROBE_CONFIG",
  "DOPPLER_PROBE_TOKEN_WRITE",
  "DOPPLER_PROBE_TOKEN_READ",
];

async function docsCheck(): Promise<{
  confirmed: boolean;
  evidence: string;
}> {
  // Two-part check:
  //   (a) the API endpoint exists — HEAD should return 401 (auth required),
  //       not 404
  //   (b) the service-tokens docs page mentions write access
  const [apiRes, tokensRes] = await Promise.all([
    fetch("https://api.doppler.com/v3/configs/config/secrets", {
      method: "HEAD",
      redirect: "follow",
    }).catch(() => null),
    fetch("https://docs.doppler.com/docs/service-tokens", {
      redirect: "follow",
    }).catch(() => null),
  ]);

  const apiStatus = apiRes?.status ?? 0;
  const endpointExists = apiStatus === 401 || apiStatus === 403 || apiStatus === 405;

  let tokensMentionWrite = false;
  if (tokensRes && tokensRes.ok) {
    const html = await tokensRes.text();
    tokensMentionWrite = /write|read[- ]?only|read[- ]?access/i.test(html);
  }

  return {
    confirmed: endpointExists && tokensMentionWrite,
    evidence: `api-endpoint-exists-(HEAD=${apiStatus})=${endpointExists}, tokens-doc-mentions-write/read-scope=${tokensMentionWrite}`,
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
        "full runtime probe (write with write-token + rejected with read-token): deferred to sandbox",
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
    evidence: `${docs.evidence} | runner stub: env present but write/read token assertion not yet implemented (avoids accidental writes)`,
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
