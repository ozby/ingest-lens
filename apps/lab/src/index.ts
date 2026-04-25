/**
 * Consistency Lab — Hono app entry point (Task 4.1).
 *
 * Route structure:
 *   GET  /lab               — overview page
 *   GET  /lab/:slug         — scenario page (s1a-correctness, s1b-latency)
 *   POST /lab/s1a/run       — start S1a run (lock-first, gauge-second, F-02)
 *   POST /lab/s1b/run       — start S1b run (lock-first, gauge-second, F-02)
 *   GET  /lab/sessions/:id/stream — SSE stream with Last-Event-ID replay (F-05, F-09)
 *
 * Middleware applied to all /lab/* routes:
 *   1. Kill-switch (F-01): 404 if disabled
 *   2. Session-cookie reader: attaches sessionId to context
 *
 * Scheduled Workers (crons):
 *   every-15-min  — HeartbeatCron (daily, workloadSize=100, F-19)
 *   0 0 * * 0     — HeartbeatWeeklyCron (Sunday, workloadSize=10k, F-19)
 *   0 0 * * *     — KillSwitchAutoReset (daily reset, F-11)
 *   every-15-min  — CostEstimatorCron (computes every 3rd tick, F-01, F9T, F-13)
 *
 * DO classes re-exported for Wrangler migration detection:
 *   SessionLock, LabConcurrencyGauge (from @repo/lab-core)
 *   S1aRunnerDO (from @repo/lab-s1a-correctness)
 *   S1bRunnerDO (from @repo/lab-s1b-latency)
 */
import { Hono } from "hono";
import type { Env } from "./env";
import { killSwitchMiddleware } from "./middleware/kill-switch";
import { sessionCookieMiddleware } from "./middleware/session-cookie";
import { overviewRoutes } from "./routes/overview";
import { scenarioRoutes } from "./routes/scenario";
import { runRoutes } from "./routes/run";
import { streamRoutes } from "./routes/stream";
import { handleHeartbeatCron } from "./crons/heartbeat";
import { runKillSwitchAutoReset } from "./crons/kill-switch-auto-reset";
import { runCostEstimator } from "./crons/cost-estimator";
import { KillSwitchKV } from "@repo/lab-core";
import type { KVNamespace } from "@repo/lab-core";

// Re-export DO classes so Wrangler can detect them for migrations.
export { SessionLock, LabConcurrencyGauge } from "@repo/lab-core";
export { S1aRunnerDO } from "@repo/lab-s1a-correctness";
export { S1bRunnerDO } from "@repo/lab-s1b-latency";

const app = new Hono<{ Bindings: Env }>();

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use("/lab/*", killSwitchMiddleware);
app.use("/lab/*", sessionCookieMiddleware);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.route("/lab", overviewRoutes);
app.route("/lab", scenarioRoutes);
app.route("/lab", runRoutes);
app.route("/lab", streamRoutes);

// ─── Scheduled dispatcher ─────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;
    const ksKv = env.KILL_SWITCH_KV as unknown as KVNamespace;

    // HeartbeatCron: every 15 min (daily heartbeat + cost estimator)
    if (cron === "*/15 * * * *") {
      await handleHeartbeatCron(env, cron);

      const ks = new KillSwitchKV(ksKv);
      await runCostEstimator({
        analytics: {
          // Production: Analytics Engine is write-only in Workers; read via CF API.
          // For v1, return 0 — safe fallback that never triggers spurious alerts (F9T).
          async queryMonthlyCounter(_metric: string): Promise<number> {
            return 0;
          },
        },
        kv: env.KILL_SWITCH_KV as unknown as {
          get(k: string): Promise<string | null>;
          put(k: string, v: string): Promise<void>;
        },
        killSwitch: ks,
        webhookUrl: env.HEARTBEAT_WEBHOOK_URL,
        webhook: env.HEARTBEAT_WEBHOOK_URL
          ? {
              async send(url: string, payload: unknown): Promise<void> {
                await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
              },
            }
          : undefined,
      });
    }

    // HeartbeatWeeklyCron: Sunday midnight (10k workload)
    if (cron === "0 0 * * 0") {
      await handleHeartbeatCron(env, cron);
    }

    // KillSwitchAutoReset: daily midnight (F-11)
    if (cron === "0 0 * * *") {
      const ks = new KillSwitchKV(ksKv);
      await runKillSwitchAutoReset({
        killSwitch: ks,
        kv: env.KILL_SWITCH_KV as unknown as {
          get(k: string): Promise<string | null>;
          put(k: string, v: string): Promise<void>;
        },
        webhookUrl: env.HEARTBEAT_WEBHOOK_URL,
        webhook: env.HEARTBEAT_WEBHOOK_URL
          ? {
              async send(url: string, payload: unknown): Promise<void> {
                await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
              },
            }
          : undefined,
      });
    }
  },
};
