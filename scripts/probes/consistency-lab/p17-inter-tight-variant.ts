#!/usr/bin/env bun
/**
 * Probe p17 — Inter Tight specifically (not just the Inter family) is
 * available for self-hosting.
 *
 * p07 confirmed the rsms/inter LICENSE covers the family. This probe
 * additionally verifies Inter Tight's font files ship in the family repo
 * (or Fontsource) so the Lane D font choice can actually be fulfilled.
 */
import { emit } from "./lib/verdict";

const PROBE = "p17-inter-tight-variant";
const CLAIM =
  "Inter Tight specifically ships as a distinct typeface (not just Inter) and is self-hostable";
const REPO_API = "https://api.github.com/repos/rsms/inter/git/trees/master?recursive=1";
const FONTSOURCE = "https://registry.npmjs.org/@fontsource-variable/inter-tight/latest";

async function run(): Promise<void> {
  try {
    const [treeRes, fsRes] = await Promise.all([fetch(REPO_API), fetch(FONTSOURCE)]);

    let repoHasInterTight = false;
    if (treeRes.ok) {
      const tree = (await treeRes.json()) as {
        tree?: { path: string }[];
      };
      repoHasInterTight = (tree.tree ?? []).some((entry) => /inter[-_ ]?tight/i.test(entry.path));
    }

    let fontsourceHasInterTight = false;
    let fontsourceVersion = "?";
    if (fsRes.ok) {
      const meta = (await fsRes.json()) as { version?: string };
      fontsourceHasInterTight = Boolean(meta.version);
      fontsourceVersion = meta.version ?? "?";
    }

    const confirmed = repoHasInterTight || fontsourceHasInterTight;
    const verdict = confirmed ? "CONFIRMED" : "WRONG";

    await emit({
      probe: PROBE,
      verdict,
      claim: CLAIM,
      evidence: [
        `rsms/inter-tree-has-inter-tight=${repoHasInterTight}`,
        `@fontsource-variable/inter-tight-published=${fontsourceHasInterTight}`,
        `fontsource-version=${fontsourceVersion}`,
      ].join(" | "),
      citation: FONTSOURCE,
    });
    if (verdict === "WRONG") process.exit(1);
  } catch (err) {
    await emit({
      probe: PROBE,
      verdict: "UNREACHABLE",
      claim: CLAIM,
      evidence: `threw: ${err instanceof Error ? err.message : String(err)}`,
      citation: FONTSOURCE,
    });
    process.exit(2);
  }
}

run();
