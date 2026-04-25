#!/usr/bin/env bun
/**
 * Orchestrates: pulumi up → sync wrangler.toml IDs → wrangler deploy --env
 *
 * Follows the CF-official split:
 *   - Pulumi provisions long-lived underlying resources (Hyperdrive, KV, R2)
 *   - wrangler owns Worker script + routes + custom domains + DNS for the
 *     custom domain (atomically via `custom_domain = true` in wrangler.toml)
 *
 * CLOUDFLARE_API_TOKEN is sourced from Doppler project "ozby-shell".
 * Usage: bun ./src/deploy/deploy.ts <stack>
 *        (run from infra/; cwd assumption matches the other scripts)
 */
import { execSync } from "node:child_process";
import process from "node:process";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/deploy.ts <stack>");
  process.exit(1);
}

// Doppler project `ozby-shell` currently exposes only a `dev` config.
// The `prd` branch needs a corresponding Doppler config provisioned before it can run.
const dopplerConfig = stack === "prd" ? "production" : "dev";
const doppler = `doppler run --project ozby-shell --config ${dopplerConfig} --`;

// Phase 1: provision underlying CF resources (Hyperdrive, KV, R2).
execSync(`${doppler} pulumi up --yes --stack ${stack}`, { stdio: "inherit" });

// Phase 2: sync the real IDs from Pulumi outputs into wrangler.toml in place.
execSync(`${doppler} bun ./src/deploy/sync-wrangler-ids.ts ${stack}`, {
  stdio: "inherit",
});

// Phase 3: wrangler creates the Worker script, route, and custom domain in a
// single atomic deploy. Runs from repo root via pnpm --filter so wrangler.toml
// is picked up from apps/workers/.
execSync(`${doppler} pnpm --filter @repo/workers exec wrangler deploy --env ${stack}`, {
  stdio: "inherit",
});

// Phase 4: build the SPA with the per-env API base URL baked in, then deploy
// the pure-static client Worker. Uses `build:<stack>` so Vite picks up the
// correct .env.<stack> file (VITE_API_BASE_URL).
execSync(`${doppler} pnpm --filter client build:${stack}`, { stdio: "inherit" });
execSync(`${doppler} pnpm --filter client exec wrangler deploy --env ${stack}`, {
  stdio: "inherit",
});
