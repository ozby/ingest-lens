#!/usr/bin/env bun
/**
 * Probe p12 — Does `@neondatabase/serverless` (or Neon's WebSocket driver)
 * support Postgres `LISTEN/NOTIFY` from a CF Worker?
 *
 * If yes, the redesigned scenario 1a/1b third path has a cleaner option than
 * raw `cloudflare:sockets` `connect()` — use the Neon-maintained driver that
 * handles TLS + WebSocket tunneling + reconnect. Could simplify the
 * `PostgresDirectNotifyPath` Durable Object significantly.
 *
 * Docs-as-truth check against both the package README on npm and the Neon
 * docs page for serverless drivers.
 */
import { emit } from "./lib/verdict";

const PROBE = "p12-neon-serverless-listen";
const CLAIM = "@neondatabase/serverless supports LISTEN/NOTIFY from CF Workers (via WebSocket)";

const NPM_URL = "https://registry.npmjs.org/@neondatabase/serverless/latest";
const NEON_DOCS_URL = "https://neon.com/docs/serverless/serverless-driver";

async function checkDocs(docsRes: Response): Promise<{
  docsHasListen: boolean;
  docsMentionsWebSocket: boolean;
}> {
  if (!docsRes.ok) return { docsHasListen: false, docsMentionsWebSocket: false };
  const docsHtml = await docsRes.text();
  return {
    docsHasListen: /\bLISTEN\b|notification[\s\S]{0,60}channel|\bon\s*\(\s*['"]notification/i.test(
      docsHtml,
    ),
    docsMentionsWebSocket: /WebSocket|wss:\/\//i.test(docsHtml),
  };
}

function resolveVerdict(
  confirmedListen: boolean,
  confirmedTransport: boolean,
): "CONFIRMED" | "PARTIAL" | "WRONG" {
  if (confirmedListen && confirmedTransport) return "CONFIRMED";
  if (confirmedTransport) return "PARTIAL";
  return "WRONG";
}

async function run(): Promise<void> {
  try {
    const [npmRes, docsRes] = await Promise.all([
      fetch(NPM_URL),
      fetch(NEON_DOCS_URL, { redirect: "follow" }),
    ]);
    if (!npmRes.ok) {
      await emit({
        probe: PROBE,
        verdict: "UNREACHABLE",
        claim: CLAIM,
        evidence: `npm HTTP ${npmRes.status}`,
        citation: NPM_URL,
      });
      process.exit(2);
    }
    const npmMeta = (await npmRes.json()) as {
      version?: string;
      readme?: string;
      description?: string;
    };
    const version = npmMeta.version ?? "?";
    const readme = (npmMeta.readme ?? "") + " " + (npmMeta.description ?? "");

    const readmeHasListen =
      /\bLISTEN\b|pg[_-]?listen|\bnotifies?\b|\.on\(['"]notification['"]/i.test(readme);
    const readmeMentionsWebSocket = /WebSocket|wss:\/\//i.test(readme);

    const { docsHasListen, docsMentionsWebSocket } = await checkDocs(docsRes);

    const verdict = resolveVerdict(
      readmeHasListen || docsHasListen,
      readmeMentionsWebSocket || docsMentionsWebSocket,
    );

    await emit({
      probe: PROBE,
      verdict,
      claim: CLAIM,
      evidence: [
        `neon@${version}`,
        `readme-mentions-LISTEN=${readmeHasListen}`,
        `readme-mentions-WebSocket=${readmeMentionsWebSocket}`,
        `docs-mentions-LISTEN=${docsHasListen}`,
        `docs-mentions-WebSocket=${docsMentionsWebSocket}`,
      ].join(" | "),
      citation: NEON_DOCS_URL,
    });
    if (verdict === "WRONG") process.exit(1);
  } catch (err) {
    await emit({
      probe: PROBE,
      verdict: "UNREACHABLE",
      claim: CLAIM,
      evidence: `threw: ${err instanceof Error ? err.message : String(err)}`,
      citation: NEON_DOCS_URL,
    });
    process.exit(2);
  }
}

run();
