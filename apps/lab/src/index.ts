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

export default app;
