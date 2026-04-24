#!/usr/bin/env bun
/**
 * Wraps a command with `doppler run --config <config> -- <cmd>`.
 * Fails with an actionable message if doppler is not set up.
 *
 * Usage: bun ./scripts/with-doppler.ts dev pnpm turbo run dev
 */
import { spawnSync, execSync } from "node:child_process";
import process from "node:process";

const argv = process.argv.slice(2);
let project: string | undefined;

if (argv[0] === "--project") {
  project = argv[1];
  argv.splice(0, 2);
}

const [config, ...cmd] = argv;

if (!config || cmd.length === 0) {
  console.error("Usage: bun ./scripts/with-doppler.ts [--project <name>] <config> <command...>");
  process.exit(1);
}

// Verify doppler CLI is available
try {
  execSync("doppler --version", { stdio: "ignore" });
} catch {
  console.error("\n❌  doppler CLI not found. Run: brew install dopplerhq/cli/doppler\n");
  process.exit(1);
}

if (!project) {
  try {
    const linkedProject = execSync("doppler configure get project --plain", {
      encoding: "utf8",
    }).trim();
    if (!linkedProject) {
      throw new Error("empty project");
    }
  } catch {
    console.error(
      "\n❌  Doppler project not linked. Run: doppler setup or pass --project <name>\n" +
        "    See docs/secrets/doppler.md for setup instructions.\n",
    );
    process.exit(1);
  }
}

const dopplerArgs = ["run"];
if (project) {
  dopplerArgs.push("--project", project);
}
dopplerArgs.push("--config", config, "--", ...cmd);

const result = spawnSync("doppler", dopplerArgs, {
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
