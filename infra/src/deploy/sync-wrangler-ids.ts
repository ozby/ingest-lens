#!/usr/bin/env bun
/**
 * Syncs Pulumi stack outputs into apps/workers/wrangler.toml.
 * Uses @ozby/wrangler-sync — generic Pulumi→wrangler binding patcher.
 *
 * Usage: bun ./src/deploy/sync-wrangler-ids.ts <stack>
 *        (must be run from `infra/` — matches deploy.ts cwd convention)
 */
import { syncWranglerBindings } from "@ozby/wrangler-sync";
import { resolve } from "node:path";
import process from "node:process";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/sync-wrangler-ids.ts <stack>");
  process.exit(1);
}

const result = syncWranglerBindings({
  stackName: stack,
  wranglerTomlPath: resolve("../apps/workers/wrangler.toml"),
  mappings: [
    { pulumiOutput: "hyperdriveId", header: `[[env.${stack}.hyperdrive]]`, key: "id" },
    { pulumiOutput: "kvNamespaceId", header: `[[env.${stack}.kv_namespaces]]`, key: "id" },
    { pulumiOutput: "r2BucketName", header: `[[env.${stack}.r2_buckets]]`, key: "bucket_name" },
  ],
  verify: [
    { pulumiOutput: "deliveryQueueName", pattern: `queue = "{value}"` },
    { pulumiOutput: "deliveryDlqName", pattern: `dead_letter_queue = "{value}"` },
  ],
});

if (result.changed) {
  console.log(`wrangler.toml [env.${stack}] bindings updated in place.`);
} else {
  console.log(`wrangler.toml [env.${stack}] bindings already current; no-op.`);
}
console.log(`Queue names verified.`);
