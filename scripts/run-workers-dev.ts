import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const workersDir = path.join(repoRoot, "apps", "workers");
const passthroughArgs = process.argv.slice(2);

function hasVarOverride(name: string): boolean {
  for (let i = 0; i < passthroughArgs.length; i += 1) {
    const arg = passthroughArgs[i];
    if (arg === "--var") {
      const next = passthroughArgs[i + 1];
      if (typeof next === "string" && next.startsWith(`${name}:`)) return true;
      continue;
    }
    if (typeof arg === "string" && arg.startsWith(`--var=${name}:`)) return true;
  }
  return false;
}

const forwardedVars: Array<[string, string | undefined]> = [
  ["JWT_SECRET", process.env.JWT_SECRET ?? "local-dev-jwt-secret"],
  ["AUTO_HEAL_THRESHOLD", process.env.AUTO_HEAL_THRESHOLD],
  ["LOW_CONFIDENCE_THRESHOLD", process.env.LOW_CONFIDENCE_THRESHOLD],
];

const args = ["exec", "wrangler", "dev", ...passthroughArgs];
for (const [name, value] of forwardedVars) {
  if (!value || hasVarOverride(name)) continue;
  args.push("--var", `${name}:${value}`);
}

const child = spawn("pnpm", args, {
  cwd: workersDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error("[run-workers-dev] failed to launch wrangler dev", error);
  process.exit(1);
});
