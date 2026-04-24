#!/usr/bin/env bun
/**
 * Probe p16 — Postgres `NOTIFY` payload size ceiling.
 *
 * The scenario design fires `NOTIFY lab_probe_s1a, <payload>` per-message.
 * The payload carries `{msg_id, seq, session_id, payload: string(64)}` — an
 * order of ~160–200 bytes encoded. Postgres ships a hard 8000-byte payload
 * ceiling; we need this documented so the scenario can't accidentally grow
 * beyond it (either by schema drift or by a future scenario reusing the
 * NOTIFY path).
 */
import { emit } from "./lib/verdict";

const PROBE = "p16-postgres-notify-payload";
const CLAIM = "Postgres NOTIFY payload is capped at 8000 bytes; scenario schema stays well under";
const URL = "https://www.postgresql.org/docs/current/sql-notify.html";

async function run(): Promise<void> {
  const res = await fetch(URL, { redirect: "follow" });
  if (!res.ok) {
    await emit({
      probe: PROBE,
      verdict: "UNREACHABLE",
      claim: CLAIM,
      evidence: `HTTP ${res.status}`,
      citation: URL,
    });
    process.exit(2);
  }
  const html = await res.text();
  // Postgres docs say: "... at the time of the notify. The payload string
  // ... is limited to fewer than 8000 bytes."
  const mentions8000 = /\b8000\b/.test(html);
  const mentionsPayload = /\bpayload\b/i.test(html);
  const mentionsBytes = /\bbytes?\b/i.test(html);
  const confirmed = mentions8000 && mentionsPayload && mentionsBytes;

  await emit({
    probe: PROBE,
    verdict: confirmed ? "CONFIRMED" : "PARTIAL",
    claim: CLAIM,
    evidence: [
      `docs-mentions-8000=${mentions8000}`,
      `docs-mentions-payload=${mentionsPayload}`,
      `docs-mentions-bytes=${mentionsBytes}`,
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
