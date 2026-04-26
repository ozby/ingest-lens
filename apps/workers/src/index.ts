export { TopicRoom } from "./do/TopicRoom";
export { HealStreamDO } from "./consumers/HealStreamDO";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./db/client";
import { authRoutes } from "./routes/auth";
import { queueRoutes } from "./routes/queue";
import { messageRoutes } from "./routes/message";
import { topicRoutes } from "./routes/topic";
import { dashboardRoutes } from "./routes/dashboard";
import { intakeRoutes } from "./routes/intake";
import { healStreamRoutes } from "./routes/healStream";
import { rateLimiter, authRateLimiter } from "./middleware/rateLimiter";
import { handleDeliveryBatch } from "./consumers/deliveryConsumer";
import { handleScheduled as handleScheduledPurge } from "./cron/purgeExpiredReviewPayloads";

const app = new Hono<{ Bindings: Env }>();

// Per-env exact-origin CORS — no wildcard. ALLOWED_ORIGIN is set in
// [env.dev.vars] / [env.prd.vars] in wrangler.toml.
app.use("*", (c, next) => {
  const allowedOrigin = c.env.ALLOWED_ORIGIN;
  return cors({
    origin: allowedOrigin ?? [],
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 300,
  })(c, next);
});
app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));

// All API routes: general 100 req/60s
app.use("/api/*", rateLimiter);
// Auth routes additionally constrained to 5 req/60s (brute-force protection)
app.use("/api/auth/*", authRateLimiter);
app.route("/api/auth", authRoutes);
app.route("/api/queues", queueRoutes);
app.route("/api/messages", messageRoutes);
app.route("/api/topics", topicRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/intake", intakeRoutes);
app.route("/api/heal", healStreamRoutes);

export default {
  fetch: app.fetch,
  queue: handleDeliveryBatch,
  scheduled: handleScheduledPurge,
};
