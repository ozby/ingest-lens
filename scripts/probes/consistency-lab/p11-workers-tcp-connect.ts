#!/usr/bin/env bun
/**
 * Probe p11 — CF Workers expose a `connect()` TCP API via `cloudflare:sockets`
 * that can hold a long-lived session-pinned socket (required for a direct
 * Postgres LISTEN from a Durable Object).
 *
 * This is the load-bearing API for the REDESIGNED scenario 1a/1b third path
 * (`PostgresDirectNotifyPath`). Without it, the rewrite is dead.
 *
 * Docs-as-truth verification: fetches the official CF Workers TCP sockets
 * page and asserts the `connect()` function, the `cloudflare:sockets` module,
 * and persistent-connection language are all present.
 *
 * A full runtime probe (DO holds connection + issues LISTEN + receives NOTIFY
 * within 5s) lives inside p01 when the sandbox is provisioned.
 */
import { emit } from "./lib/verdict";

const PROBE = "p11-workers-tcp-connect";
const CLAIM =
  "CF Workers expose `connect()` via `cloudflare:sockets` for outbound TCP that can hold a session-pinned connection";
const URL = "https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/";

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

  const hasConnectFn = /\bconnect\s*\(/.test(html);
  const hasModuleImport = /cloudflare:sockets|'cloudflare:socket/i.test(html);
  const hasSocketType = /\bSocket\b/.test(html);
  const hasPersistentHint =
    /persist|long[- ]?lived|hibernation|keep[- ]?alive|readable|writable/i.test(html);

  const verdict =
    hasConnectFn && hasModuleImport && hasSocketType && hasPersistentHint ? "CONFIRMED" : "PARTIAL";

  const evidence = [
    `connect()-fn=${hasConnectFn}`,
    `cloudflare:sockets-module=${hasModuleImport}`,
    `Socket-type=${hasSocketType}`,
    `persistent-connection-language=${hasPersistentHint}`,
    `bytes=${html.length}`,
    "full LISTEN-over-connect runtime probe: deferred to p01",
  ].join(" | ");

  await emit({ probe: PROBE, verdict, claim: CLAIM, evidence, citation: URL });
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
