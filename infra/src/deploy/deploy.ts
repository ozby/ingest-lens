#!/usr/bin/env bun
/**
 * Orchestrates: neon branch → pulumi up → sync wrangler.toml IDs → wrangler deploy
 * Usage: bun ./src/deploy/deploy.ts <stack>  (run from infra/)
 */
import { ensureNamedBranch, getNeonConfig } from "./neon-branches";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

import { findRepoRoot } from "./repo-root";
import { readProductionReleaseMetadata, validateProductionReleaseMetadata } from "./release-gate";
import { resolveDeployRuntimeEnv } from "./runtime-env";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/deploy.ts <stack>");
  process.exit(1);
}

const repoRoot = findRepoRoot();
const infraRoot = join(repoRoot, "infra");

const runtimeEnv = await resolveDeployRuntimeEnv("secrets-only", [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
  "NEON_API_KEY",
  "NEON_PROJECT_ID",
  "PULUMI_ACCESS_TOKEN",
]);

function run(command: string, ...args: string[]) {
  const result = spawnSync(command, args, {
    cwd: infraRoot,
    env: runtimeEnv,
    shell: false,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}`);
  }
}

function runWithInput(command: string, input: string, ...args: string[]) {
  const result = spawnSync(command, args, {
    cwd: infraRoot,
    env: runtimeEnv,
    input: `${input}
`,
    shell: false,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}`);
  }
}

const isProd = stack === "prd";

if (isProd) {
  const releaseVersion = readArg("--release-version") ?? process.env.RELEASE_VERSION;
  const metadata = readProductionReleaseMetadata(
    join(repoRoot, "infra", "release-metadata.production.json"),
  );
  validateProductionReleaseMetadata(metadata, releaseVersion);
}

const wranglerEnv = isProd ? "production" : stack;
const clientBuildMode = isProd ? "prd" : stack;

// ── Neon branch provisioning (non-prd only) ──────────────────────────
if (!isProd) {
  console.log(`\n📦 Provisioning Neon branch for stack: ${stack}`);
  const neonConfig = getNeonConfig(runtimeEnv);
  const branch = await ensureNamedBranch(neonConfig, stack);
  console.log(`  Branch "${stack}" (${branch.id}), reused=${branch.reused}`);

  runWithInput(
    "pulumi",
    branch.appDatabaseUrl,
    "config",
    "set",
    "--secret",
    "ingest-lens:neonConnectionString",
    "--stack",
    stack,
  );
  console.log(`  Neon connection string set in Pulumi config.`);
}

// ── Pulumi up ───────────────────────────────────────────────────────
run("pulumi", "up", "--yes", "--stack", stack);

// ── Sync wrangler.toml IDs ──────────────────────────────────────────
run("bun", join(infraRoot, "src", "deploy", "sync-wrangler-ids.ts"), stack);

// ── Wrangler deploy ─────────────────────────────────────────────────
run("pnpm", "--filter", "@repo/workers", "exec", "wrangler", "deploy", "--env", wranglerEnv);
run("pnpm", "--filter", "client", `build:${clientBuildMode}`);
run("pnpm", "--filter", "client", "exec", "wrangler", "deploy", "--env", wranglerEnv);
