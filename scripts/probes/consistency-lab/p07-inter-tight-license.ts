#!/usr/bin/env bun
/**
 * Probe p07 — Inter Tight is released under SIL Open Font License 1.1.
 *
 * Fetches the LICENSE.txt from the rsms/inter repo (which contains the Inter
 * family including Inter Tight) and asserts the OFL 1.1 passage is present.
 */
import { emit } from "./lib/verdict";

const PROBE = "p07-inter-tight-license";
const CLAIM = "Inter (including Inter Tight) is SIL Open Font License 1.1";
const URL = "https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt";

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
  const text = await res.text();
  const hasSil = /SIL Open Font License/.test(text);
  const hasV11 = /Version 1\.1/.test(text);
  const hasInter = /Inter/i.test(text);

  const verdict = hasSil && hasV11 && hasInter ? "CONFIRMED" : "WRONG";
  const evidence = [
    `SIL-OFL-present=${hasSil}`,
    `v1.1-present=${hasV11}`,
    `"Inter"-present=${hasInter}`,
    `bytes=${text.length}`,
  ].join(", ");
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
