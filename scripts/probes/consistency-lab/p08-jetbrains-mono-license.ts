#!/usr/bin/env bun
/**
 * Probe p08 — JetBrains Mono is released under OFL 1.1 (NOT Apache 2.0 as a prior
 * agent claimed).
 *
 * Fetches OFL.txt and README.md from JetBrains/JetBrainsMono. The README tells
 * us the split: the font itself is OFL 1.1, while Apache 2.0 covers only the
 * build-script source tree.
 */
import { emit } from "./lib/verdict";

const PROBE = "p08-jetbrains-mono-license";
const CLAIM =
  "JetBrains Mono typeface is SIL Open Font License 1.1 (Apache 2.0 covers only build scripts)";
const OFL_URL = "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt";
const README_URL = "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/README.md";

async function run(): Promise<void> {
  const [oflRes, readmeRes] = await Promise.all([fetch(OFL_URL), fetch(README_URL)]);

  if (!oflRes.ok || !readmeRes.ok) {
    await emit({
      probe: PROBE,
      verdict: "UNREACHABLE",
      claim: CLAIM,
      evidence: `OFL=${oflRes.status} README=${readmeRes.status}`,
      citation: OFL_URL,
    });
    process.exit(2);
  }

  const ofl = await oflRes.text();
  const readme = await readmeRes.text();

  const oflHasSil = /SIL Open Font License/.test(ofl);
  const oflHasV11 = /Version 1\.1/.test(ofl);
  const readmeSaysFontIsOfl = /available under the.*?OFL|available under.*?Open Font License/i.test(
    readme,
  );
  const readmeSaysSourceIsApache =
    /source code[\s\S]{0,200}?Apache|Apache[\s\S]{0,200}?source code/i.test(readme);

  const verdict = oflHasSil && oflHasV11 && readmeSaysFontIsOfl ? "CONFIRMED" : "WRONG";
  const evidence = [
    `OFL-file-has-SIL=${oflHasSil}`,
    `OFL-file-has-v1.1=${oflHasV11}`,
    `README-says-font-is-OFL=${readmeSaysFontIsOfl}`,
    `README-says-source-is-Apache=${readmeSaysSourceIsApache}`,
  ].join(", ");

  await emit({
    probe: PROBE,
    verdict,
    claim: CLAIM,
    evidence,
    citation: OFL_URL,
  });
  if (verdict !== "CONFIRMED") process.exit(1);
}

run().catch(async (err) => {
  await emit({
    probe: PROBE,
    verdict: "UNREACHABLE",
    claim: CLAIM,
    evidence: `threw: ${err instanceof Error ? err.message : String(err)}`,
    citation: OFL_URL,
  });
  process.exit(2);
});
