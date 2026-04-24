#!/usr/bin/env bun
/**
 * Probe p03 — HTMX 2.0.x SSE extension + `Last-Event-ID` reconnect + `sse-swap`
 * per-event-type DOM replacement all work.
 *
 * Local probe. Requires Playwright + miniflare harness. Not yet implemented;
 * emits SKIPPED_NO_ACCESS so the orchestrator runs the rest.
 *
 * Lighter-weight fallback verifies that current HTMX + SSE-extension versions
 * exist on the CDN (registry check) — that's a weaker claim but runs in any
 * environment.
 */
import { emit } from "./lib/verdict";

const PROBE = "p03-htmx-sse-replay";
const CLAIM =
  "htmx 2.0.x + htmx-ext-sse 2.2.x support Last-Event-ID reconnect and sse-swap per-event-type DOM updates";
const CITATION = "https://htmx.org/extensions/sse/";

const HTMX_REGISTRY = "https://registry.npmjs.org/htmx.org/latest";
const SSE_EXT_REGISTRY = "https://registry.npmjs.org/htmx-ext-sse/latest";

async function run(): Promise<void> {
  // Lightweight registry probe: verify current versions match the pins the
  // shell blueprint declares. Full Playwright probe is a TODO.
  try {
    const [htmxRes, sseRes] = await Promise.all([fetch(HTMX_REGISTRY), fetch(SSE_EXT_REGISTRY)]);
    if (!htmxRes.ok || !sseRes.ok) {
      await emit({
        probe: PROBE,
        verdict: "UNREACHABLE",
        claim: CLAIM,
        evidence: `npm registry HTTP status htmx=${htmxRes.status} sse=${sseRes.status}`,
        citation: CITATION,
      });
      process.exit(2);
    }
    const htmxMeta = (await htmxRes.json()) as { version?: string };
    const sseMeta = (await sseRes.json()) as { version?: string };
    const htmxVersion = htmxMeta.version ?? "?";
    const sseVersion = sseMeta.version ?? "?";

    const htmxIs2 = htmxVersion.startsWith("2.");
    const sseIs22 = sseVersion.startsWith("2.2.");

    const verdict =
      htmxIs2 && sseIs22
        ? "PARTIAL" // PARTIAL because we confirmed versions exist, not SSE-replay
        : "WRONG";

    await emit({
      probe: PROBE,
      verdict,
      claim: CLAIM,
      evidence: [
        `htmx@latest=${htmxVersion} (is-2.x=${htmxIs2})`,
        `htmx-ext-sse@latest=${sseVersion} (is-2.2.x=${sseIs22})`,
        "full Playwright SSE-reconnect probe: TODO",
      ].join(" | "),
      citation: CITATION,
    });
    if (verdict === "WRONG") process.exit(1);
  } catch (err) {
    await emit({
      probe: PROBE,
      verdict: "UNREACHABLE",
      claim: CLAIM,
      evidence: `threw: ${err instanceof Error ? err.message : String(err)}`,
      citation: CITATION,
    });
    process.exit(2);
  }
}

run();
