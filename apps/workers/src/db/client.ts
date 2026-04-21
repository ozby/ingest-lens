import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Env = {
  HYPERDRIVE: Hyperdrive;
  DATABASE_URL?: string; // local dev fallback
  JWT_SECRET: string;
  NODE_ENV?: string;
};

export function createDb(env: Env) {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("No database connection available");
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}
