#!/usr/bin/env bun
/**
 * Run all consistency-lab probes sequentially. Each probe writes one JSONL
 * verdict line to `verdicts.jsonl` and stdout. Orchestrator returns non-zero
 * if any probe returned `WRONG` (explicit regression); `SKIPPED_NO_ACCESS`,
 * `PARTIAL`, `UNREACHABLE` do not fail the gate but are surfaced.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOG_PATH = join(__dirname, "verdicts.jsonl");

const PROBES = [
  "p01-hyperdrive-listen-notify.ts",
  "p02-worker-cpu-300s.ts",
  "p03-htmx-sse-replay.ts",
  "p04-workers-assets-binding.ts",
  "p05-tdigest-on-workers.ts",
  "p06-doppler-secret-update.ts",
  "p07-inter-tight-license.ts",
  "p08-jetbrains-mono-license.ts",
  "p09-cf-queues-one-consumer.ts",
  "p10-cf-billing-api-absence.ts",
  "p11-workers-tcp-connect.ts",
  "p12-neon-serverless-listen.ts",
  "p13-cf-worker-subrequest-limit.ts",
  "p14-hyperdrive-pricing.ts",
  "p15-repo-ak-cli.ts",
  "p16-postgres-notify-payload.ts",
  "p17-inter-tight-variant.ts",
];

const STRICT = process.argv.includes("--strict");

function runOne(probe: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("bun", [join(__dirname, probe)], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    proc.on("close", (code) => resolve(code ?? 2));
    proc.on("error", () => resolve(2));
  });
}

async function main(): Promise<void> {
  await writeFile(LOG_PATH, "", "utf8"); // reset log per run
  for (const probe of PROBES) {
    await runOne(probe);
  }

  const raw = await readFile(LOG_PATH, "utf8");
  const lines = raw.split("\n").filter((l) => l.length > 0);
  type Verdict = "CONFIRMED" | "WRONG" | "PARTIAL" | "UNREACHABLE" | "SKIPPED_NO_ACCESS";
  const reports = lines.map(
    (l) =>
      JSON.parse(l) as {
        probe: string;
        verdict: Verdict;
      },
  );

  const tally: Record<Verdict, number> = {
    CONFIRMED: 0,
    WRONG: 0,
    PARTIAL: 0,
    UNREACHABLE: 0,
    SKIPPED_NO_ACCESS: 0,
  };
  for (const r of reports) tally[r.verdict] += 1;

  const summary = [
    "",
    "=".repeat(72),
    "consistency-lab probes — run summary",
    "=".repeat(72),
    `CONFIRMED:          ${tally.CONFIRMED}`,
    `WRONG:              ${tally.WRONG}`,
    `PARTIAL:            ${tally.PARTIAL}`,
    `UNREACHABLE:        ${tally.UNREACHABLE}`,
    `SKIPPED_NO_ACCESS:  ${tally.SKIPPED_NO_ACCESS}`,
    "-".repeat(72),
    ...reports.map((r) => `  ${r.probe.padEnd(36)}  ${r.verdict}`),
    "=".repeat(72),
  ].join("\n");

  process.stdout.write(`${summary}\n`);

  // Default mode: WRONG is a hard fail. SKIPPED/PARTIAL/UNREACHABLE surface
  // but pass the exit gate. Use `--strict` for blueprint-transition gating:
  // any non-CONFIRMED blocks downstream (matches the probes blueprint's
  // "any non-CONFIRMED verdict blocks moves out of planned/" rule).
  if (tally.WRONG > 0) {
    process.stderr.write(
      `\n${tally.WRONG} probe(s) returned WRONG — blueprint claims need revision\n`,
    );
    process.exit(1);
  }
  if (STRICT) {
    const nonConfirmed = tally.PARTIAL + tally.UNREACHABLE + tally.SKIPPED_NO_ACCESS;
    if (nonConfirmed > 0) {
      process.stderr.write(
        `\n[strict] ${nonConfirmed} probe(s) are not CONFIRMED — blueprint transition blocked\n`,
      );
      process.exit(1);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`run-all failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
