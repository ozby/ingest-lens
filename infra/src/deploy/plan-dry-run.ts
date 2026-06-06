#!/usr/bin/env bun
import { join } from "node:path";
import process from "node:process";

import { resolvePreviewLane } from "./lanes";
import { readProductionReleaseMetadata, validateProductionReleaseMetadata } from "./release-gate";
import { findRepoRoot } from "./repo-root";

function readLane(): string {
  const lane = process.argv[2] ?? process.env.DEPLOY_LANE;
  if (!lane) {
    throw new Error("Usage: bun plan-dry-run.ts <dev|preview_main|preview_pr_<n>|prd>");
  }
  return lane;
}

function previewLaneFromDeployLane(lane: string): string {
  if (lane === "preview_main") return "preview-main";
  if (lane.startsWith("preview_pr_")) return lane.replace("preview_pr_", "preview-pr-");
  throw new Error(`Unsupported preview deploy lane ${lane}`);
}

const repoRoot = findRepoRoot();
const lane = readLane();

if (lane === "prd") {
  const metadataPath = join(repoRoot, "infra", "release-metadata.production.json");
  const metadata = readProductionReleaseMetadata(metadataPath);

  validateProductionReleaseMetadata(metadata, metadata.releaseVersion);

  console.log(`[deploy-dry-run] prd metadata OK: ${metadata.releaseVersion}`);
  console.log("[deploy-dry-run] required checks:", metadata.requiredChecks?.join(", ") ?? "<none>");
  console.log("[deploy-dry-run] live deploy still requires RELEASE_VERSION to match metadata");
  console.log(
    "[deploy-dry-run] planned live step: bun infra/src/deploy/deploy-production.ts --release-version <semver>",
  );
  process.exit(0);
}

if (lane === "dev") {
  console.log("[deploy-dry-run] dev deploy uses the Cloudflare dev environment.");
  console.log("[deploy-dry-run] planned live step: wp exec wrangler deploy --env dev");
  process.exit(0);
}

const previewLane = resolvePreviewLane(previewLaneFromDeployLane(lane));
console.log(`[deploy-dry-run] preview lane OK: ${previewLane.lane}`);
console.log(
  `[deploy-dry-run] planned live step: bun infra/src/deploy/deploy-preview.ts --lane ${previewLane.lane}`,
);
