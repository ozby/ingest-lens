import { appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Verdict = "CONFIRMED" | "WRONG" | "PARTIAL" | "UNREACHABLE" | "SKIPPED_NO_ACCESS";

export interface ProbeReport {
  probe: string;
  verdict: Verdict;
  claim: string;
  evidence: string;
  citation?: string;
  ranAt: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOG_PATH = join(findProbeRoot(__dirname), "verdicts.jsonl");

function findProbeRoot(startDir: string): string {
  let dir = startDir;
  while (dirname(dir) !== dir) {
    if (existsSync(join(dir, "run-all.ts")) || existsSync(join(dir, "verdicts.jsonl"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error(`Could not locate consistency-lab probe root from ${startDir}`);
}

export async function emit(report: Omit<ProbeReport, "ranAt">): Promise<void> {
  const full: ProbeReport = { ...report, ranAt: new Date().toISOString() };
  const line = `${JSON.stringify(full)}\n`;
  process.stdout.write(line);
  await appendFile(LOG_PATH, line, "utf8");
}

export function ok<T>(cond: boolean, msg: string, value?: T): asserts cond {
  if (!cond) {
    const err = new Error(msg);
    (err as Error & { probeEvidence?: T }).probeEvidence = value;
    throw err;
  }
}
