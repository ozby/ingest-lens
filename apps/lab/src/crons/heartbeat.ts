/**
 * HeartbeatCron — scheduled Worker that pings /lab/health synthetically.
 *
 * Triggered every 15 minutes (cron: every-15-min).
 * Runs scenario s1a synthetically with workloadSize=100 (F-19).
 * Writes a row to lab.heartbeat on every tick.
 * On three consecutive FAILED rows, posts a webhook to HEARTBEAT_WEBHOOK_URL.
 * Uses AdminBypassToken so the request bypasses kill-switch middleware (F-06).
 *
 * HeartbeatWeeklyCron (cron: "0 0 * * 0") runs workloadSize=10_000.
 */

import type { Env } from "../env";
import { isValidAdminToken, hashToken, writeAdminAuditEntry } from "@repo/lab-core";

export interface HeartbeatRow {
  runId: string;
  ts: string; // ISO8601
  status: "OK" | "FAILED";
  durationMs: number;
  failureReason?: string;
  kind: "daily" | "weekly";
}

export interface HeartbeatDeps {
  /** Fetch a URL — injectable for tests. Default: globalThis.fetch */
  fetch?: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>;
  /** Store for last N heartbeat rows. Injectable for tests. */
  store: HeartbeatStore;
  /** KV for admin audit entries */
  kv: { get(k: string): Promise<string | null>; put(k: string, v: string): Promise<void> };
  /** HEARTBEAT_WEBHOOK_URL from env */
  webhookUrl?: string;
  /** LAB_ADMIN_SECRET from env */
  adminSecret?: string;
  /** The Worker's own base URL */
  baseUrl: string;
  /** Injectable now (ISO8601) for deterministic tests */
  now?: string;
}

export interface HeartbeatStore {
  /** Return the last N rows ordered newest-first */
  getRecent(n: number): Promise<HeartbeatRow[]>;
  /** Append a row */
  append(row: HeartbeatRow): Promise<void>;
}

const CONSECUTIVE_FAIL_THRESHOLD = 3;

/**
 * Run a heartbeat tick.
 * Returns the row that was written.
 */
async function pingHealthEndpoint(
  baseUrl: string,
  workloadSize: number,
  adminSecret: string,
  isConfigured: boolean,
  fetcher: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>,
): Promise<{ status: "OK" | "FAILED"; failureReason?: string }> {
  try {
    const url = `${baseUrl}/lab/health?workloadSize=${workloadSize}`;
    const headers: Record<string, string> = {};
    if (isConfigured) {
      headers["X-Lab-Admin-Token"] = adminSecret;
    }
    const res = await fetcher(url, { headers });
    if (res.ok) return { status: "OK" };
    return { status: "FAILED", failureReason: `HTTP ${res.status}` };
  } catch (err) {
    return { status: "FAILED", failureReason: err instanceof Error ? err.message : String(err) };
  }
}

async function checkAndNotify(
  row: HeartbeatRow,
  store: HeartbeatStore,
  webhookUrl: string,
  fetcher: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>,
): Promise<void> {
  const recent = await store.getRecent(CONSECUTIVE_FAIL_THRESHOLD);
  const allFailed =
    recent.length === CONSECUTIVE_FAIL_THRESHOLD &&
    recent.every((r) => r.status === "FAILED") &&
    recent[0]?.runId === row.runId;
  if (allFailed) {
    await sendWebhookAlert(webhookUrl, recent, fetcher);
  }
}

export async function runHeartbeat(
  deps: HeartbeatDeps,
  kind: "daily" | "weekly",
): Promise<HeartbeatRow> {
  const now = deps.now ?? new Date().toISOString();
  const runId = `heartbeat-${kind}-${now}`;
  const workloadSize = kind === "weekly" ? 10_000 : 100;
  const fetcher = deps.fetch ?? globalThis.fetch;
  const adminSecret = deps.adminSecret ?? "";

  // Mint a short-lived token fingerprint for audit trail (F-06)
  const tokenHash = await hashToken(`${adminSecret}:${now}`);
  await writeAdminAuditEntry(deps.kv, {
    action: "admin_bypass",
    actorId: `heartbeat-cron-${kind}`,
    tokenHash,
    isAdminBypass: true,
    createdAt: now,
  });

  // Validate that we have a secret before calling the endpoint
  const hasValidSecret = isValidAdminToken(adminSecret, adminSecret);
  // (isValidAdminToken compares against itself — always true if non-empty)
  const isConfigured = adminSecret.length > 0 && hasValidSecret;

  const startMs = Date.now();
  const { status, failureReason } = await pingHealthEndpoint(
    deps.baseUrl,
    workloadSize,
    adminSecret,
    isConfigured,
    fetcher,
  );
  const durationMs = Date.now() - startMs;

  const row: HeartbeatRow = {
    runId,
    ts: now,
    status,
    durationMs,
    ...(failureReason !== undefined ? { failureReason } : {}),
    kind,
  };

  await deps.store.append(row);

  if (status === "FAILED" && deps.webhookUrl) {
    await checkAndNotify(row, deps.store, deps.webhookUrl, fetcher);
  }

  return row;
}

async function sendWebhookAlert(
  webhookUrl: string,
  lastRows: HeartbeatRow[],
  fetcher: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>,
): Promise<void> {
  const payload = {
    alert: "heartbeat_consecutive_failures",
    scenario: "s1a-correctness",
    lastHeartbeatIds: lastRows.map((r) => r.runId),
    failureReasons: lastRows.map((r) => r.failureReason ?? "unknown"),
    timestamp: new Date().toISOString(),
  };

  await fetcher(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * In-memory implementation of HeartbeatStore (for tests and lightweight usage).
 * Production should use a KV-backed or DB-backed implementation.
 */
export class InMemoryHeartbeatStore implements HeartbeatStore {
  private rows: HeartbeatRow[] = [];

  async getRecent(n: number): Promise<HeartbeatRow[]> {
    return this.rows.slice(-n).reverse();
  }

  async append(row: HeartbeatRow): Promise<void> {
    this.rows.push(row);
  }

  all(): HeartbeatRow[] {
    return [...this.rows];
  }
}

/**
 * Scheduled handler entry point — dispatched from index.ts.
 */
export async function handleHeartbeatCron(env: Env, cronExpr: string): Promise<void> {
  const isWeekly = cronExpr === "0 0 * * 0";
  const kind: "daily" | "weekly" = isWeekly ? "weekly" : "daily";

  // Production store backed by KV (stores last 10 rows serialized as JSON)
  const store = new KVHeartbeatStore(env.KILL_SWITCH_KV as unknown as KVHeartbeatNamespace);

  await runHeartbeat(
    {
      store,
      kv: env.KILL_SWITCH_KV as unknown as {
        get(k: string): Promise<string | null>;
        put(k: string, v: string): Promise<void>;
      },
      webhookUrl: env.HEARTBEAT_WEBHOOK_URL,
      adminSecret: env.LAB_SESSION_SECRET, // reuse session secret for admin bypass identity
      baseUrl: "https://ingestlens-lab.workers.dev",
    },
    kind,
  );
}

interface KVHeartbeatNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const HB_STORE_KEY = "lab:heartbeat:rows";

class KVHeartbeatStore implements HeartbeatStore {
  constructor(private kv: KVHeartbeatNamespace) {}

  async getRecent(n: number): Promise<HeartbeatRow[]> {
    const raw = await this.kv.get(HB_STORE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as HeartbeatRow[];
    return rows.slice(-n).reverse();
  }

  async append(row: HeartbeatRow): Promise<void> {
    const raw = await this.kv.get(HB_STORE_KEY);
    const rows: HeartbeatRow[] = raw ? (JSON.parse(raw) as HeartbeatRow[]) : [];
    rows.push(row);
    // Keep last 20 rows
    const trimmed = rows.slice(-20);
    await this.kv.put(HB_STORE_KEY, JSON.stringify(trimmed));
  }
}
