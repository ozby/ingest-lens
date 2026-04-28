#!/usr/bin/env bun
/**
 * Orchestrates: neon branch → pulumi up → sync wrangler.toml IDs → wrangler deploy
 * Usage: bun ./src/deploy/deploy.ts <stack>  (run from infra/)
 */
import { doppler, execWith } from "@webpresso/runtime/process/secret-runner";
import { ensureNamedBranch, getNeonConfig } from "@webpresso/neon-core";
import { execSync } from "node:child_process";
import process from "node:process";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/deploy.ts <stack>");
  process.exit(1);
}

const run = execWith(
  doppler({ project: "ozby-shell", config: stack === "prd" ? "production" : "dev" }),
);

const isProd = stack === "prd";

// ── Neon branch provisioning (non-prd only) ──────────────────────────
if (!isProd) {
  console.log(`\n📦 Provisioning Neon branch for stack: ${stack}`);
  const neonConfig = getNeonConfig(process.env);
  const branch = await ensureNamedBranch(neonConfig, stack);
  console.log(`  Branch "${stack}" (${branch.id}), reused=${branch.reused}`);

  // Set the connection string as Pulumi config
  execSync(
    `pulumi config set --secret ingest-lens:neonConnectionString "${branch.appDatabaseUrl}" --stack ${stack}`,
    { stdio: "inherit" },
  );
  console.log(`  Neon connection string set in Pulumi config.`);
}

// ── Pulumi up ───────────────────────────────────────────────────────
await run("pulumi", "up", "--yes", "--stack", stack);

// ── Sync wrangler.toml IDs ──────────────────────────────────────────
await run("bun", "./src/deploy/sync-wrangler-ids.ts", stack);

// ── Wrangler deploy ─────────────────────────────────────────────────
await run("pnpm", "--filter", "@repo/workers", "exec", "wrangler", "deploy", "--env", stack);
await run("pnpm", "--filter", "client", `build:${stack}`);
await run("pnpm", "--filter", "client", "exec", "wrangler", "deploy", "--env", stack);
