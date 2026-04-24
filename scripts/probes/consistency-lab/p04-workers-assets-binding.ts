#!/usr/bin/env bun
/**
 * Probe p04 — Workers Assets binding serves static files via
 * `assets.directory` + `assets.binding` config keys.
 *
 * Source-verified via the CF docs fetch (2026-04-24). This probe does a
 * lightweight docs-as-truth check — fetches the canonical Static Assets
 * binding doc and asserts the `directory` and `binding` keys are named there.
 *
 * A full runtime probe (wrangler dev + curl-the-asset) is a TODO; it needs
 * wrangler + a sandbox app dir, which is deploy-adjacent but can be done
 * locally with miniflare.
 */
import { emit } from "./lib/verdict";

const PROBE = "p04-workers-assets-binding";
const CLAIM = "Workers Assets binding uses `assets.directory` + `assets.binding` config keys";
const URL = "https://developers.cloudflare.com/workers/static-assets/binding/";

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
  const hasDirectory = /"directory"|assets\.directory|directory\s*=/.test(html);
  const hasBinding = /"binding"|assets\.binding|binding\s*=/.test(html);
  const mentionsAssets = /Static Assets|assets\s*binding/i.test(html);

  const verdict = hasDirectory && hasBinding && mentionsAssets ? "CONFIRMED" : "PARTIAL";
  const evidence = [
    `directory-key=${hasDirectory}`,
    `binding-key=${hasBinding}`,
    `Static-Assets-mentioned=${mentionsAssets}`,
    "full wrangler-dev runtime probe: TODO",
  ].join(" | ");

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
