import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./db/client";
import { authRoutes } from "./routes/auth";
import { queueRoutes } from "./routes/queue";
import { messageRoutes } from "./routes/message";
import { topicRoutes } from "./routes/topic";
import { dashboardRoutes } from "./routes/dashboard";
import { handleDeliveryBatch } from "./consumers/deliveryConsumer";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());
app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/auth", authRoutes);
app.route("/api/queues", queueRoutes);
app.route("/api/messages", messageRoutes);
app.route("/api/topics", topicRoutes);
app.route("/api/dashboard", dashboardRoutes);

export default {
  fetch: app.fetch,
  queue: handleDeliveryBatch,
};
