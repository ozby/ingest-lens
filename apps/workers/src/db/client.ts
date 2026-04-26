import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DeliveryPayload = {
  messageId: string;
  seq: string;
  queueId: string;
  pushEndpoint: string;
  topicId: string | null;
  attempt?: number;
};

export type Env = {
  HYPERDRIVE: Hyperdrive;
  DATABASE_URL?: string; // local dev fallback
  JWT_SECRET: string;
  NODE_ENV?: string;
  ALLOWED_ORIGIN?: string; // per-env SPA origin for CORS (e.g. https://dev.ozby.dev)
  AI?: Ai;
  DELIVERY_QUEUE: Queue<DeliveryPayload>;
  RATE_LIMITER?: RateLimit;
  AUTH_RATE_LIMITER?: RateLimit; // tighter limit (5 req/60s) for login + register
  ANALYTICS: AnalyticsEngineDataset;
  TOPIC_ROOMS: DurableObjectNamespace;
  KV: KVNamespace;
};

export function createDb(env: Env) {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("No database connection available");
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}
