#!/usr/bin/env bun
/**
 * Orchestrates: neon branch → pulumi up → sync wrangler.toml IDs → wrangler deploy
 * Usage: bun ./src/deploy/deploy.ts <stack>  (run from infra/)
 */
import { doppler, execWith } from "@webpresso/process-utils/secret-runner";
import { getNeonConfig } from "@webpresso/neon";
import { execSync } from "node:child_process";
import process from "node:process";

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";

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

  const listUrl = `${NEON_API_BASE_URL}/projects/${neonConfig.projectId}/branches`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${neonConfig.apiKey}` },
  });
  if (!listRes.ok) throw new Error(`Failed to list Neon branches: ${listRes.status}`);

  const branches = (await listRes.json()) as { branches: Array<{ id: string; name: string }> };
  const existing = branches.branches.find((b) => b.name === stack);

  let connectionUri: string;

  if (existing) {
    console.log(`  Branch "${stack}" already exists (${existing.id}), reusing.`);
    const endpointsUrl = `${NEON_API_BASE_URL}/projects/${neonConfig.projectId}/branches/${existing.id}/endpoints`;
    const epRes = await fetch(endpointsUrl, {
      headers: { Authorization: `Bearer ${neonConfig.apiKey}` },
    });
    if (!epRes.ok) throw new Error(`Failed to get Neon endpoints: ${epRes.status}`);
    const epData = (await epRes.json()) as {
      endpoints: Array<{ host: string; current_state: string }>;
    };
    const host =
      epData.endpoints.find((ep) => ep.current_state !== "idle")?.host ?? epData.endpoints[0]?.host;
    if (!host) throw new Error(`No endpoint found for branch ${existing.id}`);

    const rolePassword = process.env.NEON_ROLE_PASSWORD ?? "";
    const roleName = process.env.NEON_ROLE_NAME ?? "neondb_owner";
    const dbName = process.env.NEON_DATABASE_NAME ?? "neondb";
    connectionUri = `postgresql://${roleName}:${encodeURIComponent(rolePassword)}@${host}/${dbName}?sslmode=require`;
  } else {
    console.log(`  Creating Neon branch "${stack}" from parent ${neonConfig.parentBranchId}...`);
    const createUrl = `${NEON_API_BASE_URL}/projects/${neonConfig.projectId}/branches`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${neonConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: { name: stack, parent_id: neonConfig.parentBranchId },
        endpoints: [{ type: "read_write" }],
      }),
    });
    if (!createRes.ok) throw new Error(`Failed to create Neon branch: ${createRes.status}`);

    const data = (await createRes.json()) as {
      branch: { id: string };
      connection_uris: Array<{ connection_uri: string }>;
    };
    connectionUri = data.connection_uris[0].connection_uri;
    console.log(`  Branch created: ${data.branch.id}`);
  }

  // Set the connection string as Pulumi config
  execSync(
    `pulumi config set --secret ingest-lens:neonConnectionString "${connectionUri}" --stack ${stack}`,
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
