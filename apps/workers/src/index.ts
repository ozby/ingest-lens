export { TopicRoom } from "./do/TopicRoom";
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
import { rateLimiter } from "./middleware/rateLimiter";
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

// Auth routes get rate-limiting applied at the app level (FIX-2: CSO audit)
app.use("/api/auth/*", rateLimiter);
app.route("/api/auth", authRoutes);
app.route("/api/queues", queueRoutes);
app.route("/api/messages", messageRoutes);
app.route("/api/topics", topicRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/intake", intakeRoutes);

export default {
  fetch: app.fetch,
  queue: handleDeliveryBatch,
  scheduled: handleScheduledPurge,
};
