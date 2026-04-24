#!/usr/bin/env bun
/**
 * Probe p15 — Repo sanity: does the `ak` CLI actually exist in this repo's
 * workspace, and does it support `e2e --suite` as the blueprints assume?
 *
 * This is an internal-claim probe: scenario 1a/1b blueprints say
 * `pnpm exec ak e2e --suite s1a-correctness` registers and runs the suite.
 * If `ak` doesn't exist, or doesn't support `--suite`, the AK suite
 * registration tasks (2.7 / 3.7) are ghosts.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emit } from "./lib/verdict";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..");

const PROBE = "p15-repo-ak-cli";
const CLAIM =
  "`pnpm exec ak --help` succeeds in this repo and `ak e2e` accepts a `--suite` argument";

function runCmd(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: REPO_ROOT });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr });
    });
  });
}

async function run(): Promise<void> {
  const help = await runCmd("pnpm", ["exec", "ak", "--help"], 30_000);
  const akExists = help.code === 0 || /Usage|Commands|ak/.test(help.stdout);

  let e2eHelpOk = false;
  let suiteFlagMentioned = false;
  if (akExists) {
    const e2eHelp = await runCmd("pnpm", ["exec", "ak", "e2e", "--help"], 30_000);
    e2eHelpOk = e2eHelp.code === 0 || /e2e/.test(e2eHelp.stdout);
    suiteFlagMentioned = /--suite|suite\s+name/i.test(e2eHelp.stdout + e2eHelp.stderr);
  }

  const verdict: "CONFIRMED" | "PARTIAL" | "WRONG" = !akExists
    ? "WRONG"
    : suiteFlagMentioned
      ? "CONFIRMED"
      : "PARTIAL";

  await emit({
    probe: PROBE,
    verdict,
    claim: CLAIM,
    evidence: [
      `ak-cli-exists=${akExists}`,
      `ak-e2e-help-ok=${e2eHelpOk}`,
      `--suite-flag-mentioned=${suiteFlagMentioned}`,
    ].join(" | "),
    citation: "internal: pnpm exec ak --help",
  });
  if (verdict === "WRONG") process.exit(1);
}

run().catch(async (err) => {
  await emit({
    probe: PROBE,
    verdict: "UNREACHABLE",
    claim: CLAIM,
    evidence: `threw: ${err instanceof Error ? err.message : String(err)}`,
    citation: "internal: pnpm exec ak --help",
  });
  process.exit(2);
});
