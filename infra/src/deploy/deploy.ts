#!/usr/bin/env bun
/**
 * Orchestrates: pulumi up → sync wrangler.toml IDs → wrangler deploy
 * Usage: bun ./src/deploy/deploy.ts <stack>  (run from infra/)
 */
import { doppler, execWith } from "@webpresso/process-utils/secret-runner";
import process from "node:process";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/deploy.ts <stack>");
  process.exit(1);
}

const run = execWith(
  doppler({ project: "ozby-shell", config: stack === "prd" ? "production" : "dev" }),
);

await run("pulumi", "up", "--yes", "--stack", stack);
await run("bun", "./src/deploy/sync-wrangler-ids.ts", stack);
await run("pnpm", "--filter", "@repo/workers", "exec", "wrangler", "deploy", "--env", stack);
await run("pnpm", "--filter", "client", `build:${stack}`);
await run("pnpm", "--filter", "client", "exec", "wrangler", "deploy", "--env", stack);
