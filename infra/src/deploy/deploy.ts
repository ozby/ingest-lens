#!/usr/bin/env bun
/**
 * Orchestrates: pulumi up → sync wrangler.toml IDs → wrangler deploy
 *
 * Secrets are loaded once via doppler() and injected into each subprocess.
 * Usage: bun ./src/deploy/deploy.ts <stack>  (run from infra/)
 */
import { doppler, exec } from "@webpresso/process-utils/secret-runner";
import process from "node:process";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/deploy.ts <stack>");
  process.exit(1);
}

const secrets = doppler({
  project: "ozby-shell",
  config: stack === "prd" ? "production" : "dev",
});

await exec(secrets, ["pulumi", "up", "--yes", "--stack", stack]);
await exec(secrets, ["bun", "./src/deploy/sync-wrangler-ids.ts", stack]);
await exec(secrets, [
  "pnpm",
  "--filter",
  "@repo/workers",
  "exec",
  "wrangler",
  "deploy",
  "--env",
  stack,
]);
await exec(secrets, ["pnpm", "--filter", "client", `build:${stack}`]);
await exec(secrets, ["pnpm", "--filter", "client", "exec", "wrangler", "deploy", "--env", stack]);
