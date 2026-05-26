#!/usr/bin/env bun
/**
 * Orchestrates: neon branch → pulumi up → sync wrangler.toml IDs → wrangler deploy
 * Usage: bun ./src/deploy/deploy.ts <stack>  (run from infra/)
 */
import { ensureNamedBranch, getNeonConfig } from "@webpresso/webpresso/db/neon";
import { resolveRuntimeProfile } from "@webpresso/webpresso/runtime/env";
import { execSync, spawnSync } from "node:child_process";
import process from "node:process";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/deploy.ts <stack>");
  process.exit(1);
}

const resolvedEnv = await resolveRuntimeProfile("secrets-only");
const runtimeEnv = {
  ...process.env,
  ...resolvedEnv,
} as NodeJS.ProcessEnv;

function run(command: string, ...args: string[]) {
  const result = spawnSync(command, args, {
    env: runtimeEnv,
    shell: false,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`"${[command, ...args].join(" ")}" exited with status ${result.status ?? 1}`);
  }
}

const isProd = stack === "prd";

// ── Neon branch provisioning (non-prd only) ──────────────────────────
if (!isProd) {
  console.log(`\n📦 Provisioning Neon branch for stack: ${stack}`);
  const neonConfig = getNeonConfig(runtimeEnv);
  const branch = await ensureNamedBranch(neonConfig, stack);
  console.log(`  Branch "${stack}" (${branch.id}), reused=${branch.reused}`);

  execSync(
    `pulumi config set --secret ingest-lens:neonConnectionString "${branch.appDatabaseUrl}" --stack ${stack}`,
    {
      env: runtimeEnv,
      stdio: "inherit",
    },
  );
  console.log(`  Neon connection string set in Pulumi config.`);
}

// ── Pulumi up ───────────────────────────────────────────────────────
run("pulumi", "up", "--yes", "--stack", stack);

// ── Sync wrangler.toml IDs ──────────────────────────────────────────
run("bun", "./src/deploy/sync-wrangler-ids.ts", stack);

// ── Wrangler deploy ─────────────────────────────────────────────────
run("pnpm", "--filter", "@repo/workers", "exec", "wrangler", "deploy", "--env", stack);
run("pnpm", "--filter", "client", `build:${stack}`);
run("pnpm", "--filter", "client", "exec", "wrangler", "deploy", "--env", stack);
