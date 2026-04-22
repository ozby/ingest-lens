#!/usr/bin/env bun
/**
 * Wraps a command with `doppler run --config <config> -- <cmd>`.
 * Fails with an actionable message if doppler is not set up.
 *
 * Usage: bun ./scripts/with-doppler.ts dev pnpm turbo run dev
 */
import { spawnSync, execSync } from "node:child_process";
import process from "node:process";

const [config, ...cmd] = process.argv.slice(2);

if (!config || cmd.length === 0) {
  console.error("Usage: bun ./scripts/with-doppler.ts <config> <command...>");
  process.exit(1);
}

// Verify doppler CLI is available
try {
  execSync("doppler --version", { stdio: "ignore" });
} catch {
  console.error("\n❌  doppler CLI not found. Run: brew install dopplerhq/cli/doppler\n");
  process.exit(1);
}

// Verify the project is linked
try {
  execSync("doppler configure get project --plain", { stdio: "ignore" });
} catch {
  console.error(
    "\n❌  Doppler project not linked. Run: doppler setup\n" +
      "    See docs/secrets/doppler.md for setup instructions.\n",
  );
  process.exit(1);
}

const result = spawnSync("doppler", ["run", "--config", config, "--", ...cmd], {
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
