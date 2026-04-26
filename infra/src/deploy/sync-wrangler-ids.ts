#!/usr/bin/env bun
/**
 * Reads the current Pulumi stack outputs (hyperdriveId, kvNamespaceId,
 * r2BucketName) and rewrites the matching `id` / `bucket_name` lines in
 * apps/workers/wrangler.toml for the `[env.<stack>]` block in place.
 *
 * Replaces the earlier wrangler-config.ts which wrote a `wrangler.generated.toml`
 * that wrangler never reads (wrangler has no `include` directive). This
 * script mutates the real wrangler.toml so `wrangler deploy --env <stack>`
 * consumes the correct IDs.
 *
 * IDs are not secrets — committing them to wrangler.toml is the canonical
 * CF pattern (see cloudflare/templates). Tokens stay in Doppler.
 *
 * Usage: bun ./src/deploy/sync-wrangler-ids.ts <stack>
 *        (must be run from `infra/` — matches deploy.ts cwd convention)
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const stack = process.argv[2];
if (!stack) {
  console.error("Usage: bun ./src/deploy/sync-wrangler-ids.ts <stack>");
  process.exit(1);
}

// This script runs inside the doppler-injected environment provided by deploy.ts
// (via secrets.exec(...)). All secrets are already in process.env — no nested
// `doppler run` needed.

interface StackOutputs {
  hyperdriveId?: string;
  kvNamespaceId?: string;
  r2BucketName?: string;
  deliveryQueueName?: string;
  deliveryDlqName?: string;
}

const outputs: StackOutputs = JSON.parse(
  execSync(`pulumi stack output --json --stack ${stack}`).toString(),
);

const required = [
  "hyperdriveId",
  "kvNamespaceId",
  "r2BucketName",
  "deliveryQueueName",
  "deliveryDlqName",
] as const;
for (const key of required) {
  if (!outputs[key]) {
    console.error(`missing Pulumi output: ${key}`);
    process.exit(1);
  }
}

const wranglerPath = resolve("../apps/workers/wrangler.toml");
const before = readFileSync(wranglerPath, "utf8");

// Patch inside [env.<stack>] sections. We keep a marker-based simple
// substitution rather than reaching for a TOML parser; the binding blocks
// under each env are stable and this is explicit-over-clever per repo
// preference. If the schema drifts, the `pnpm --filter @repo/workers
// check-types` step (via wrangler types) will catch it before deploy.
function patchEnvBinding(
  toml: string,
  _envName: string,
  blockHeader: string,
  key: string,
  value: string,
): string {
  // Full-path TOML headers like `[[env.dev.hyperdrive]]` are unambiguous
  // in the file, so we search globally for the block rather than scoping
  // to the `[env.dev]` section textually (which is error-prone because
  // sibling sub-tables like `[env.dev.vars]` close the parent section).
  const blockStart = toml.indexOf(blockHeader);
  if (blockStart === -1) {
    throw new Error(`wrangler.toml missing ${blockHeader}`);
  }
  // Block ends at the next header of any kind (`\n[` or `\n[[`) or EOF.
  const blockEnd = (() => {
    const next = toml.indexOf("\n[", blockStart + blockHeader.length);
    return next === -1 ? toml.length : next;
  })();
  const blockBody = toml.slice(blockStart, blockEnd);

  const keyRe = new RegExp(`(^|\\n)(\\s*${key}\\s*=\\s*)"[^"]*"`, "m");
  if (!keyRe.test(blockBody)) {
    throw new Error(`${blockHeader} has no "${key}" line to patch`);
  }
  const patchedBlock = blockBody.replace(keyRe, `$1$2"${value}"`);
  return toml.slice(0, blockStart) + patchedBlock + toml.slice(blockEnd);
}

let patched = before;
patched = patchEnvBinding(
  patched,
  stack,
  "[[env." + stack + ".hyperdrive]]",
  "id",
  outputs.hyperdriveId!,
);
patched = patchEnvBinding(
  patched,
  stack,
  "[[env." + stack + ".kv_namespaces]]",
  "id",
  outputs.kvNamespaceId!,
);
patched = patchEnvBinding(
  patched,
  stack,
  "[[env." + stack + ".r2_buckets]]",
  "bucket_name",
  outputs.r2BucketName!,
);

if (patched === before) {
  console.log(`wrangler.toml [env.${stack}] bindings already current; no-op.`);
} else {
  writeFileSync(wranglerPath, patched);
  console.log(`wrangler.toml [env.${stack}] bindings updated in place.`);
}

// Validate queue names match Pulumi outputs. Queue bindings reference queues
// by name (no ID to sync), but drift between wrangler.toml and Pulumi state
// would silently route to the wrong queue. Fail loudly here before deploy.
const wranglerFinal = readFileSync(wranglerPath, "utf8");
for (const [outputKey, tomlPattern] of [
  ["deliveryQueueName", `queue = "${outputs.deliveryQueueName}"`],
  ["deliveryDlqName", `dead_letter_queue = "${outputs.deliveryDlqName}"`],
] as const) {
  if (!wranglerFinal.includes(tomlPattern)) {
    console.error(
      `wrangler.toml [env.${stack}] does not reference Pulumi-managed queue ` +
        `(${outputKey} = ${outputs[outputKey]}). Update wrangler.toml to match.`,
    );
    process.exit(1);
  }
}
console.log(`Queue names verified: ${outputs.deliveryQueueName}, ${outputs.deliveryDlqName}`);
