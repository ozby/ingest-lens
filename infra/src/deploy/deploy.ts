#!/usr/bin/env bun
/**
 * Orchestrates: pulumi up → generate wrangler config → wrangler deploy
 *
 * CLOUDFLARE_API_TOKEN is sourced from Doppler project "ozby-shell".
 * The doppler run wrapper injects it before pulumi and wrangler invocations.
 */
import { execSync } from "node:child_process";
import process from "node:process";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/deploy.ts <stack>");
  process.exit(1);
}

const dopplerConfig = stack === "prd" ? "production" : "preview";
const doppler = `doppler run --project ozby-shell --config ${dopplerConfig} --`;

execSync(`${doppler} pulumi up --yes --stack ${stack}`, { stdio: "inherit" });
execSync(`${doppler} bun ./src/deploy/wrangler-config.ts ${stack}`, {
  stdio: "inherit",
});
execSync(`${doppler} pnpm --filter @repo/workers exec wrangler deploy`, {
  stdio: "inherit",
});
