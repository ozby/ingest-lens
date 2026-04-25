/**
 * ScenarioContext — shared workspace for s1a-correctness.
 *
 * Holds the DB handle (Hyperdrive-backed Drizzle instance or equivalent),
 * the CF Queue binding for the lab-s1a-cf-queues dedicated queue,
 * and the session id that scopes all DB rows for this run.
 */
import type { SessionId } from "@repo/lab-core";

export interface CfQueueBinding {
  send(body: unknown, opts?: { contentType?: "json" | "text" | "bytes" | "v8" }): Promise<void>;
  sendBatch(
    messages: Array<{ body: unknown; contentType?: "json" | "text" | "bytes" | "v8" }>,
  ): Promise<void>;
}

export interface DbClient {
  // Minimal interface used by the paths; real impl is Drizzle over Hyperdrive
  execute<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface ScenarioContext {
  readonly sessionId: SessionId;
  readonly db: DbClient;
  readonly labQueue: CfQueueBinding;
  readonly signal: AbortSignal;
}

export function createScenarioContext(
  sessionId: SessionId,
  db: DbClient,
  labQueue: CfQueueBinding,
  signal: AbortSignal,
): ScenarioContext {
  return { sessionId, db, labQueue, signal };
}
