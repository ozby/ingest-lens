#!/usr/bin/env bun
/**
 * E2E test runner — zero manual env vars. Secrets are loaded via Doppler, and
 * a Neon branch is provisioned automatically.
 *
 * Usage: bun scripts/e2e-with-neon.ts [--suite auth|foundation|full]
 *
 * No env vars required — Doppler handles everything.
 */
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import process from "node:process";
import { resolveRuntimeProfile } from "@repo/runtime-env-local";
import { getNeonConfig, NeonBranchProvider } from "../src/neon-branches";
import { listE2ESuites, resolveE2ESuiteId } from "../src/e2e-suite-manifest";
import { findE2eRepoRoot, resolveFromRepoRoot, resolveVpCommand } from "../src/repo-root";
import { resolveE2eAuthSecrets, resolveE2eSecretEnv } from "../src/runtime-secrets";
import {
  buildWorkerSpawnLifecycleOptions,
  signalWorkerProcessTreeSync,
  terminateWorkerProcessTree,
} from "../src/worker-process-lifecycle";

const suite = process.argv.includes("--suite")
  ? process.argv[process.argv.indexOf("--suite") + 1]
  : "auth";
const normalizedSuiteId = resolveE2ESuiteId(suite) ?? suite;
const selectedSuite = listE2ESuites().find((candidate) => candidate.id === normalizedSuiteId);
const requiresClientWorker =
  selectedSuite?.steps.some((step) => step.runner === "playwright") ?? false;
const REVIEWER_FLOW_SUITES = new Set(["intake", "demo", "intake-ui", "full"]);
const repoRoot = findE2eRepoRoot(import.meta.url);
const CLIENT_ASSET_LOCK_PARENT_DIR = resolveFromRepoRoot(repoRoot, ".tmp");
const CLIENT_ASSET_LOCK_DIR = resolveFromRepoRoot(repoRoot, ".tmp", "e2e-client-assets.lock");
const vpCommand = resolveVpCommand(repoRoot);
async function getAvailablePort(): Promise<number> {
  for (const host of ["::1", "127.0.0.1"] as const) {
    try {
      return await new Promise((resolvePort, reject) => {
        const server = createServer();
        server.on("error", reject);
        server.listen(0, host, () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            server.close(() =>
              reject(new Error(`Failed to resolve an open local port for ${host}`)),
            );
            return;
          }
          const { port } = address;
          server.close((error) => {
            if (error) reject(error);
            else resolvePort(port);
          });
        });
      });
    } catch {
      continue;
    }
  }

  throw new Error("Failed to resolve an open local port");
}

const apiPort = await getAvailablePort();
const apiInspectorPort = await getAvailablePort();
const apiBaseUrl = `http://localhost:${apiPort}`;
const clientPort = requiresClientWorker ? await getAvailablePort() : 3000;
const clientInspectorPort = requiresClientWorker ? await getAvailablePort() : 9229;
const clientBaseUrl = `http://localhost:${clientPort}`;

// ── Load secrets from the selected secret manager ──────────────────────
process.env.RUN_E2E ??= "1";
const secretEnv = await resolveE2eSecretEnv({
  env: process.env,
  resolveRuntimeProfile,
});
const neonConfig = getNeonConfig(secretEnv);
const provider = new NeonBranchProvider(neonConfig);

let branchId: string | null = null;
type WorkerDevProcess = ChildProcessByStdio<null, Readable, Readable>;

let apiWorker: WorkerDevProcess | null = null;
let clientWorker: WorkerDevProcess | null = null;
let holdsClientAssetLock = false;
const workerLogLines = new Map<string, string[]>();

function rememberWorkerLog(label: string, line: string) {
  const lines = workerLogLines.get(label) ?? [];
  lines.push(line);
  if (lines.length > 80) lines.shift();
  workerLogLines.set(label, lines);
}

function pipeWorkerLogs(name: string, stream: Readable, label: "stdout" | "stderr") {
  let buffer = "";
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    buffer += text;

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trimEnd();
      if (line) {
        const formatted = `[${name}:${label}] ${line}`;
        rememberWorkerLog(name, formatted);
        console.log(formatted);
      }
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
  });

  stream.on("end", () => {
    const line = buffer.trim();
    if (!line) return;
    const formatted = `[${name}:${label}] ${line}`;
    rememberWorkerLog(name, formatted);
    console.log(formatted);
  });
}

function getWorkerFailureDetails(name: string) {
  const lines = workerLogLines.get(name) ?? [];
  return lines.length > 0 ? `\nRecent ${name} logs:\n${lines.join("\n")}` : "";
}

async function acquireClientAssetLock(timeoutMs: number) {
  const startedAt = Date.now();
  await mkdir(CLIENT_ASSET_LOCK_PARENT_DIR, { recursive: true });

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await mkdir(CLIENT_ASSET_LOCK_DIR, { recursive: false });
      await writeFile(
        resolve(CLIENT_ASSET_LOCK_DIR, "owner.json"),
        JSON.stringify(
          {
            pid: process.pid,
            suite: normalizedSuiteId,
            acquiredAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      holdsClientAssetLock = true;
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  throw new Error(`Timed out waiting for client asset lock after ${timeoutMs}ms`);
}

async function releaseClientAssetLock() {
  if (!holdsClientAssetLock) return;
  holdsClientAssetLock = false;
  await rm(CLIENT_ASSET_LOCK_DIR, { recursive: true, force: true });
}

let cleanupPromise: Promise<void> | null = null;

async function cleanup() {
  cleanupPromise ??= cleanupOnce();
  return cleanupPromise;
}

async function cleanupOnce() {
  if (clientWorker) {
    await terminateWorkerProcessTree(clientWorker).catch((error) => {
      console.error("  Failed to terminate client worker process tree:", String(error));
    });
    clientWorker = null;
  }
  if (apiWorker) {
    await terminateWorkerProcessTree(apiWorker).catch((error) => {
      console.error("  Failed to terminate API worker process tree:", String(error));
    });
    apiWorker = null;
  }
  await releaseClientAssetLock().catch(() => {});
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

function signalActiveWorkersSync() {
  if (clientWorker) signalWorkerProcessTreeSync(clientWorker);
  if (apiWorker) signalWorkerProcessTreeSync(apiWorker);
}

function cleanupAndExit(exitCode: number) {
  cleanup()
    .catch((error) => {
      console.error("  Cleanup failed:", String(error));
      signalActiveWorkersSync();
    })
    .finally(() => process.exit(exitCode));
}

process.on("SIGINT", () => {
  cleanupAndExit(1);
});
process.on("SIGTERM", () => {
  cleanupAndExit(1);
});
process.on("uncaughtException", (error) => {
  console.error("E2e failed with uncaught exception:", error);
  cleanupAndExit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("E2e failed with unhandled rejection:", reason);
  cleanupAndExit(1);
});
process.on("exit", () => {
  signalActiveWorkersSync();
});

async function runMigrations(connectionUri: string) {
  const dir = resolveFromRepoRoot(repoRoot, "apps", "workers", "src", "db", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => resolveFromRepoRoot(repoRoot, "apps", "workers", "src", "db", "migrations", f));
  for (const f of files) {
    console.log(`  Running ${f}...`);
    const r = spawnSync("psql", ["-d", connectionUri, "-v", "ON_ERROR_STOP=1", "-f", f], {
      stdio: "inherit",
    });
    if (r.error) throw new Error(`Migration failed: ${f}: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`Migration failed: ${f}`);
  }
}

async function waitForHttpOk(
  name: string,
  url: string,
  timeoutMs: number,
  processRef: WorkerDevProcess | null,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (processRef && processRef.exitCode !== null) {
      throw new Error(
        `${name} exited before becoming healthy (code ${processRef.exitCode ?? "unknown"})${getWorkerFailureDetails(name)}`,
      );
    }
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `${name} did not become healthy within ${timeoutMs}ms${getWorkerFailureDetails(name)}`,
  );
}

function runCommandOrThrow(
  command: string,
  args: string[],
  options: Parameters<typeof spawnSync>[2] = {},
  failureLabel: string,
) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${failureLabel} failed with exit code ${result.status ?? 1}`);
  }
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
  const extensionResult = spawnSync(
    "psql",
    [connectionUri, "-v", "ON_ERROR_STOP=1", "-c", "CREATE EXTENSION IF NOT EXISTS pgcrypto;"],
    { stdio: "inherit" },
  );
  if (extensionResult.error) {
    throw new Error(`Extension setup failed: ${extensionResult.error.message}`);
  }
  if (extensionResult.status !== 0) {
    throw new Error(`Extension setup failed with exit code ${extensionResult.status ?? 1}`);
  }
  await runMigrations(connectionUri);
  console.log("  Migrations done.");

  // ── 3. Start wrangler dev ─────────────────────────────────────────
  console.log("🚀 Starting wrangler dev...");
  const { jwtSecret, betterAuthSecret } = resolveE2eAuthSecrets(secretEnv);
  const workerVars: string[] = [
    "--var",
    `JWT_SECRET:${jwtSecret}`,
    "--var",
    `BETTER_AUTH_SECRET:${betterAuthSecret}`,
    "--var",
    `DATABASE_URL:${connectionUri}`,
  ];
  for (const [name, value] of [
    [
      "AUTO_HEAL_THRESHOLD",
      REVIEWER_FLOW_SUITES.has(normalizedSuiteId) ? "1.1" : secretEnv.AUTO_HEAL_THRESHOLD,
    ],
    ["LOW_CONFIDENCE_THRESHOLD", secretEnv.LOW_CONFIDENCE_THRESHOLD],
    ...(requiresClientWorker ? ([["ALLOWED_ORIGIN", clientBaseUrl]] as const) : []),
  ] as const) {
    if (!value) continue;
    workerVars.push("--var", `${name}:${value}`);
  }
  workerLogLines.delete("api-worker");
  apiWorker = spawn(
    vpCommand,
    [
      "exec",
      "--filter",
      "@repo/workers",
      "--",
      "wrangler",
      "dev",
      "--port",
      String(apiPort),
      "--inspector-port",
      String(apiInspectorPort),
      ...workerVars,
    ],
    {
      ...buildWorkerSpawnLifecycleOptions(),
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...secretEnv,
        BETTER_AUTH_SECRET: betterAuthSecret,
        JWT_SECRET: jwtSecret,
        DATABASE_URL: connectionUri,
        ...(requiresClientWorker ? { ALLOWED_ORIGIN: clientBaseUrl } : {}),
      },
    },
  );
  pipeWorkerLogs("api-worker", apiWorker.stdout, "stdout");
  pipeWorkerLogs("api-worker", apiWorker.stderr, "stderr");
  await waitForHttpOk("api-worker", `${apiBaseUrl}/health`, 60_000, apiWorker);
  console.log("  API worker healthy.");

  if (requiresClientWorker) {
    console.log("🔒 Waiting for exclusive client asset lock...");
    await acquireClientAssetLock(120_000);
    console.log("🏗️ Building client for browser suite...");
    runCommandOrThrow(
      "bun",
      ["run", "build"],
      {
        cwd: resolveFromRepoRoot(repoRoot, "apps", "client"),
        // Browser e2e exercises the shipped client worker. Keep client API calls
        // same-origin (/api, /auth) so AUTH_PROXY_BASE_URL owns forwarding and
        // Playwright does not depend on cross-origin cookie behavior.
        env: { ...process.env, ...secretEnv, VITE_API_BASE_URL: "" },
      },
      "client build",
    );

    console.log("🌐 Starting client worker...");
    workerLogLines.delete("client-worker");
    clientWorker = spawn(
      vpCommand,
      [
        "exec",
        "--filter",
        "client",
        "--",
        "wrangler",
        "dev",
        "--port",
        String(clientPort),
        "--inspector-port",
        String(clientInspectorPort),
        "--var",
        `AUTH_PROXY_BASE_URL:${apiBaseUrl}`,
      ],
      {
        ...buildWorkerSpawnLifecycleOptions(),
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...secretEnv },
      },
    );
    pipeWorkerLogs("client-worker", clientWorker.stdout, "stdout");
    pipeWorkerLogs("client-worker", clientWorker.stderr, "stderr");
    await waitForHttpOk("client-worker", `${clientBaseUrl}/`, 60_000, clientWorker);
    console.log("  Client worker healthy.");
  }

  // ── 4. Run e2e tests ──────────────────────────────────────────────
  console.log(`🧪 Running e2e suite: ${suite}`);
  const testResult = spawnSync("bun", ["./src/cli/run-e2e.ts", "--suite", suite], {
    cwd: resolveFromRepoRoot(repoRoot, "apps", "e2e"),
    stdio: "inherit",
    env: {
      ...process.env,
      ...secretEnv,
      E2E_BASE_URL: apiBaseUrl,
      ...(requiresClientWorker ? { E2E_CLIENT_URL: clientBaseUrl, E2E_API_URL: apiBaseUrl } : {}),
    },
  });

  // ── 5. Cleanup ────────────────────────────────────────────────────
  await cleanup();
  process.exit(testResult.status ?? 1);
} catch (error) {
  console.error("E2e failed:", error);
  await cleanup();
  process.exit(1);
}
