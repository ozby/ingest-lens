#!/usr/bin/env bun
/**
 * Syncs Pulumi stack outputs into apps/workers/wrangler.toml.
 * Uses @ozby/wrangler-sync — generic Pulumi→wrangler binding patcher.
 *
 * Usage: bun ./src/deploy/sync-wrangler-ids.ts <stack>
 *        (must be run from `infra/` — matches deploy.ts cwd convention)
 */
import { syncWranglerBindings } from "@ozby/wrangler-sync";
import { join } from "node:path";
import process from "node:process";

import { findRepoRoot } from "./repo-root";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/sync-wrangler-ids.ts <stack>");
  process.exit(1);
}

const repoRoot = findRepoRoot();
const wranglerEnv = stack === "prd" ? "production" : stack;

const result = syncWranglerBindings({
  stackName: stack,
  wranglerTomlPath: join(repoRoot, "apps", "workers", "wrangler.toml"),
  mappings: [
    { pulumiOutput: "hyperdriveId", header: `[[env.${wranglerEnv}.hyperdrive]]`, key: "id" },
    { pulumiOutput: "kvNamespaceId", header: `[[env.${wranglerEnv}.kv_namespaces]]`, key: "id" },
    {
      pulumiOutput: "r2BucketName",
      header: `[[env.${wranglerEnv}.r2_buckets]]`,
      key: "bucket_name",
    },
  ],
  verify: [
    { pulumiOutput: "deliveryQueueName", pattern: `queue = "{value}"` },
    { pulumiOutput: "deliveryDlqName", pattern: `dead_letter_queue = "{value}"` },
  ],
});

if (result.changed) {
  console.log(`wrangler.toml [env.${wranglerEnv}] bindings updated in place.`);
} else {
  console.log(`wrangler.toml [env.${wranglerEnv}] bindings already current; no-op.`);
}
console.log(`Queue names verified.`);
