#!/usr/bin/env bun
import { ensureNamedBranch, getNeonConfig } from "./neon-branches";
import { resolveRuntimeProfile } from "@webpresso/webpresso/runtime/env";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

import {
  DEPLOY_DOMAIN,
  PREVIEW_API_SECRET_NAMES,
  type PreviewLane,
  resolvePreviewLane,
} from "./lanes";
import { findRepoRoot } from "./repo-root";

type PulumiOutputs = {
  hyperdriveId: string;
  kvNamespaceId: string;
  r2BucketName: string;
  deliveryQueueName: string;
  deliveryDlqName: string;
};

type NeonBranchListResponse = {
  branches?: Array<{ id: string; name?: string }>;
};

function parseArgs(): { lane: string; destroy: boolean } {
  const laneIndex = process.argv.indexOf("--lane");
  const positionalLane = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
  const lane = laneIndex === -1 ? positionalLane : process.argv[laneIndex + 1];
  if (!lane) {
    throw new Error("Usage: deploy-preview.ts --lane preview-main|preview-pr-<n> [--destroy]");
  }
  return { lane, destroy: process.argv.includes("--destroy") };
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell: false,
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (result.error) throw result.error;
  const stdout = result.stdout.toString();
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}`);
  }
  if (stdout) process.stdout.write(stdout);
  return stdout;
}

function runInherit(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd, env, shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}`);
  }
}

function isMissingCleanupTarget(output: string): boolean {
  return /not found|does not exist|could not find|couldn't find|no such/i.test(output);
}

function writeCleanupOutput(stdout: string, stderr: string): void {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

function cleanupFailureMessage(
  command: string,
  status: number | null,
  stdout: string,
  stderr: string,
): string | null {
  const evidence = `${stdout}
${stderr}`.trim();
  if (isMissingCleanupTarget(evidence)) {
    console.warn(`[deploy-preview] cleanup target already absent: ${command}`);
    return null;
  }
  return `${command} exited with status ${status ?? 1}`;
}

function runCleanupStep(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): string | null {
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });
  const stdout = result.stdout?.toString() ?? "";
  const stderr = result.stderr?.toString() ?? "";
  writeCleanupOutput(stdout, stderr);
  if (result.error) return result.error.message;
  if (result.status === 0) return null;
  return cleanupFailureMessage(command, result.status, stdout, stderr);
}

function requireRuntimeEnv(env: NodeJS.ProcessEnv, keys: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of keys) {
    const value = env[key];
    if (!value) missing.push(key);
    else values[key] = value;
  }
  if (missing.length > 0) {
    throw new Error(`Preview deploy is missing required runtime values: ${missing.join(", ")}`);
  }
  return values;
}

function runWithInput(
  command: string,
  args: string[],
  input: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    shell: false,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}`);
  }
}

function putWorkerSecrets(
  workerName: string,
  secretNames: string[],
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): void {
  for (const secretName of secretNames) {
    const secretValue = env[secretName];
    if (!secretValue) {
      throw new Error(`Preview deploy is missing required Worker secret: ${secretName}`);
    }
    runWithInput(
      "vp",
      [
        "exec",
        "--filter",
        "@repo/workers",
        "wrangler",
        "secret",
        "put",
        secretName,
        "--name",
        workerName,
      ],
      `${secretValue}\n`,
      repoRoot,
      env,
    );
  }
}

async function deleteNeonBranch(lane: PreviewLane, env: NodeJS.ProcessEnv): Promise<string | null> {
  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) return "missing NEON_API_KEY or NEON_PROJECT_ID";

  try {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const listResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${projectId}/branches`,
      { headers },
    );
    if (!listResponse.ok) return `Neon branch list failed with ${listResponse.status}`;
    const { branches = [] } = (await listResponse.json()) as NeonBranchListResponse;
    const branch = branches.find((candidate) => candidate.name === lane.lane);
    if (!branch) return null;

    const deleteResponse = await fetch(
      `https://console.neon.tech/api/v2/projects/${projectId}/branches/${branch.id}`,
      {
        method: "DELETE",
        headers,
      },
    );
    return deleteResponse.ok ? null : `Neon branch delete failed with ${deleteResponse.status}`;
  } catch (error) {
    return `Neon branch cleanup threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function readOutputs(infraRoot: string, lane: PreviewLane, env: NodeJS.ProcessEnv): PulumiOutputs {
  const stdout = run("pulumi", ["stack", "output", "--json", "--stack", lane.lane], infraRoot, env);
  return JSON.parse(stdout) as PulumiOutputs;
}

async function provisionPreviewResources(
  repoRoot: string,
  lane: PreviewLane,
  env: NodeJS.ProcessEnv,
): Promise<PulumiOutputs> {
  const infraRoot = join(repoRoot, "infra");
  const required = requireRuntimeEnv(env, ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID"]);
  runInherit("pulumi", ["stack", "select", "--create", lane.lane], infraRoot, env);
  runInherit(
    "pulumi",
    ["config", "set", "domain", DEPLOY_DOMAIN, "--stack", lane.lane],
    infraRoot,
    env,
  );
  runInherit(
    "pulumi",
    [
      "config",
      "set",
      "neonDatabaseName",
      env.INGEST_LENS_NEON_DATABASE_NAME ?? "neondb",
      "--stack",
      lane.lane,
    ],
    infraRoot,
    env,
  );
  runWithInput(
    "pulumi",
    ["config", "set", "--secret", "cloudflareAccountId", "--stdin", "--stack", lane.lane],
    `${required.CLOUDFLARE_ACCOUNT_ID}
`,
    infraRoot,
    env,
  );
  runWithInput(
    "pulumi",
    ["config", "set", "--secret", "cloudflareZoneId", "--stdin", "--stack", lane.lane],
    `${required.CLOUDFLARE_ZONE_ID}
`,
    infraRoot,
    env,
  );

  const neonConfig = getNeonConfig(env);
  const branch = await ensureNamedBranch(neonConfig, lane.lane);
  runWithInput(
    "pulumi",
    ["config", "set", "--secret", "neonConnectionString", "--stdin", "--stack", lane.lane],
    `${branch.appDatabaseUrl}
`,
    infraRoot,
    env,
  );
  runInherit("pulumi", ["up", "--yes", "--stack", lane.lane], infraRoot, env);
  return readOutputs(infraRoot, lane, env);
}

function apiWranglerToml(repoRoot: string, lane: PreviewLane, outputs: PulumiOutputs): string {
  const datasetSuffix = lane.lane.replaceAll("-", "_");
  return `name = "${lane.apiWorkerName}"
main = "${join(repoRoot, "apps", "workers", "src", "index.ts")}"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]
account_id = "e93986039ea9bd9729fa534a29e9e88f"
routes = [{ pattern = "${lane.apiHost}", custom_domain = true }]

[vars]
NODE_ENV = "preview"
ALLOWED_ORIGIN = "https://${lane.clientHost}"
LANGFUSE_BASE_URL = "https://cloud.langfuse.com"

[ai]
binding = "AI"

[[rate_limiting]]
binding = "RATE_LIMITER"
namespace_id = "b8f2e4a6-1c3d-4f5e-8a7b-9c0d1e2f3a4b"
simple = { limit = 100, period = 60 }

[[rate_limiting]]
binding = "AUTH_RATE_LIMITER"
namespace_id = "d0a4f6c8-3e5f-6a7b-0c9d-1e2f3a4b5c6d"
simple = { limit = 5, period = 60 }

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "${outputs.hyperdriveId}"

[[kv_namespaces]]
binding = "KV"
id = "${outputs.kvNamespaceId}"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "${outputs.r2BucketName}"

[[durable_objects.bindings]]
name = "TOPIC_ROOMS"
class_name = "TopicRoom"

[[durable_objects.bindings]]
name = "HEAL_STREAM"
class_name = "HealStreamDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TopicRoom", "HealStreamDO"]

[[queues.producers]]
binding = "DELIVERY_QUEUE"
queue = "${outputs.deliveryQueueName}"

[[queues.consumers]]
queue = "${outputs.deliveryQueueName}"
max_batch_size = 10
max_batch_timeout = 5
max_concurrency = 8
max_retries = 5
dead_letter_queue = "${outputs.deliveryDlqName}"

[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "delivery_events_${datasetSuffix}"

[triggers]
crons = ["0 * * * *"]
`;
}

function clientWranglerToml(repoRoot: string, lane: PreviewLane): string {
  return `name = "${lane.clientWorkerName}"
main = "${join(repoRoot, "apps", "client", "src", "worker.ts")}"
compatibility_date = "2024-12-01"
account_id = "e93986039ea9bd9729fa534a29e9e88f"
routes = [{ pattern = "${lane.clientHost}", custom_domain = true }]

[assets]
directory = "${join(repoRoot, "apps", "client", "dist")}"
binding = "ASSETS"
not_found_handling = "single-page-application"

[vars]
AUTH_PROXY_BASE_URL = "https://${lane.apiHost}"
`;
}

async function deployPreview(): Promise<void> {
  const { lane: rawLane, destroy } = parseArgs();
  const lane = resolvePreviewLane(rawLane);
  const repoRoot = findRepoRoot();
  const workersRoot = join(repoRoot, "apps", "workers");
  const clientRoot = join(repoRoot, "apps", "client");
  const runtimeEnv = {
    ...process.env,
    ...(await resolveRuntimeProfile("secrets-only")),
  } as NodeJS.ProcessEnv;

  if (destroy) {
    const cleanupErrors = [
      runCleanupStep(
        "vp",
        [
          "exec",
          "--filter",
          "client",
          "wrangler",
          "delete",
          "--name",
          lane.clientWorkerName,
          "--force",
        ],
        repoRoot,
        runtimeEnv,
      ),
      runCleanupStep(
        "vp",
        [
          "exec",
          "--filter",
          "@repo/workers",
          "wrangler",
          "delete",
          "--name",
          lane.apiWorkerName,
          "--force",
        ],
        repoRoot,
        runtimeEnv,
      ),
      runCleanupStep(
        "pulumi",
        ["destroy", "--yes", "--stack", lane.lane],
        join(repoRoot, "infra"),
        runtimeEnv,
      ),
      await deleteNeonBranch(lane, runtimeEnv),
    ].filter((error): error is string => error !== null);
    if (cleanupErrors.length > 0) {
      throw new Error(`Preview cleanup failed for ${lane.lane}: ${cleanupErrors.join("; ")}`);
    }
    return;
  }

  const outputs = await provisionPreviewResources(repoRoot, lane, runtimeEnv);
  const tempDir = mkdtempSync(join(tmpdir(), `ingest-lens-${lane.lane}-`));
  try {
    const apiConfigPath = join(tempDir, `${basename(lane.apiWorkerName)}.wrangler.toml`);
    const clientConfigPath = join(tempDir, `${basename(lane.clientWorkerName)}.wrangler.toml`);
    writeFileSync(apiConfigPath, apiWranglerToml(repoRoot, lane, outputs));
    writeFileSync(clientConfigPath, clientWranglerToml(repoRoot, lane));
    putWorkerSecrets(lane.apiWorkerName, [...PREVIEW_API_SECRET_NAMES], repoRoot, runtimeEnv);

    runInherit(
      "vp",
      ["exec", "--filter", "client", "vite", "build", "--mode", "preview"],
      repoRoot,
      {
        ...runtimeEnv,
        VITE_API_BASE_URL: `https://${lane.apiHost}`,
      },
    );
    runInherit(
      "vp",
      ["exec", "--filter", "@repo/workers", "wrangler", "deploy", "--config", apiConfigPath],
      workersRoot,
      runtimeEnv,
    );
    runInherit(
      "vp",
      ["exec", "--filter", "client", "wrangler", "deploy", "--config", clientConfigPath],
      clientRoot,
      runtimeEnv,
    );
    console.log(`Preview API: https://${lane.apiHost}`);
    console.log(`Preview client: https://${lane.clientHost}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

await deployPreview();
