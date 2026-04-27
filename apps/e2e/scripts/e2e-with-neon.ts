#!/usr/bin/env bun
/**
 * E2E test runner — zero manual env vars. Secrets are loaded via Doppler, and
 * a Neon branch is provisioned automatically.
 *
 * Usage: bun scripts/e2e-with-neon.ts [--suite auth|foundation|full]
 *
 * No env vars required — Doppler handles everything.
 */
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { doppler } from "@webpresso/process-utils/secret-runner";
import { getNeonConfig, NeonBranchProvider } from "@webpresso/neon";

const suite = process.argv.includes("--suite")
  ? process.argv[process.argv.indexOf("--suite") + 1]
  : "auth";

// ── Load secrets from Doppler ──────────────────────────────────────────
const dopplerEnv = await doppler({ project: "ozby-shell", config: "dev" }).load();
const neonConfig = getNeonConfig(dopplerEnv);
const provider = new NeonBranchProvider(neonConfig);

let branchId: string | null = null;
let workerPid: number | null = null;

async function cleanup() {
  if (workerPid) {
    try {
      process.kill(workerPid, "SIGTERM");
    } catch {}
    workerPid = null;
  }
  if (branchId) {
    console.log(`\n  Deleting Neon branch ${branchId}...`);
    try {
      await provider.deleteBranch(branchId);
      console.log("  Branch deleted.");
    } catch (e) {
      console.error("  Delete failed (will expire via TTL):", String(e));
    }
    branchId = null;
  }
}

process.on("SIGINT", () => {
  cleanup().then(() => process.exit(1));
});
process.on("SIGTERM", () => {
  cleanup().then(() => process.exit(1));
});

async function runMigrations(connectionUri: string) {
  const dir = resolve("apps/workers/src/db/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => resolve(dir, f));
  for (const f of files) {
    console.log(`  Running ${f}...`);
    const r = spawnSync("psql", ["-d", connectionUri, "-v", "ON_ERROR_STOP=1", "-f", f], {
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`Migration failed: ${f}`);
  }
}

async function waitForHealth(port: number, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Worker did not become healthy");
}

try {
  // ── 1. Create Neon branch with 1h TTL ──────────────────────────────
  console.log("📦 Creating Neon e2e branch (1h TTL)...");
  const branch = await provider.createBranch({ ttlMs: 3_600_000 });
  branchId = branch.id;
  const connectionUri = branch.connectionUri;
  if (!connectionUri) throw new Error("Neon branch created without connectionUri");
  console.log(`  Branch created: ${branchId}`);

  // ── 2. Run migrations ─────────────────────────────────────────────
  console.log("🔄 Running migrations...");
  spawnSync(
    "psql",
    [connectionUri, "-v", "ON_ERROR_STOP=1", "-c", "CREATE EXTENSION IF NOT EXISTS pgcrypto;"],
    { stdio: "inherit" },
  );
  await runMigrations(connectionUri);
  console.log("  Migrations done.");

  // ── 3. Start wrangler dev ─────────────────────────────────────────
  console.log("🚀 Starting wrangler dev...");
  const jwtSecret = dopplerEnv.JWT_SECRET ?? "local-dev-jwt-secret";
  const worker = spawn(
    "pnpm",
    [
      "--filter",
      "@repo/workers",
      "exec",
      "wrangler",
      "dev",
      "--port",
      "8787",
      "--var",
      `JWT_SECRET:${jwtSecret}`,
      "--var",
      `DATABASE_URL:${connectionUri}`,
    ],
    { stdio: "pipe" },
  );
  workerPid = worker.pid!;
  await waitForHealth(8787, 30_000);
  console.log("  Worker healthy.");

  // ── 4. Run e2e tests ──────────────────────────────────────────────
  console.log(`🧪 Running e2e suite: ${suite}`);
  const testResult = spawnSync(
    "pnpm",
    ["--filter", "@repo/e2e", "run", "e2e:run", "--suite", suite],
    {
      stdio: "inherit",
      env: { ...process.env, E2E_BASE_URL: "http://127.0.0.1:8787" },
    },
  );

  // ── 5. Cleanup ────────────────────────────────────────────────────
  await cleanup();
  process.exit(testResult.status ?? 1);
} catch (error) {
  console.error("E2e failed:", error);
  await cleanup();
  process.exit(1);
}
