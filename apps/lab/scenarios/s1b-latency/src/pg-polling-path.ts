/**
 * PgPollingLatencyPath — Task 3.3
 *
 * Measures Postgres polling latency:
 *   INSERT with inserted_at = now(), poller SELECTs new rows
 *   and records recv_at = now() server-side.
 *   latency = recv_at - inserted_at (ms).
 *
 * Poll interval configurable (default 100ms).
 * Uses Hyperdrive for the INSERT. The poll interval is part of the honest
 * story — it is printed in the summary.
 */
import type { ScenarioRunner, SessionContext, ScenarioEvent } from "@repo/lab-core";

export interface PgPollingLatencyConfig {
  /** Execute SQL query — call site passes Hyperdrive-backed executor */
  execute: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  /** Number of messages to insert + poll. Default: 1000 */
  messageCount?: number;
  /** Poll interval in ms. Default: 100 */
  pollIntervalMs?: number;
  /** Path identifier for events */
  pathId?: string;
}

interface PollRow {
  message_id: string;
  inserted_at: string; // ISO timestamp from Postgres
}

export class PgPollingLatencyPath implements ScenarioRunner {
  private readonly execute: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  private readonly messageCount: number;
  readonly pollIntervalMs: number;
  private readonly pathId: string;

  constructor(config: PgPollingLatencyConfig) {
    this.execute = config.execute;
    this.messageCount = config.messageCount ?? 1000;
    this.pollIntervalMs = config.pollIntervalMs ?? 100;
    this.pathId = config.pathId ?? "pg-polling-latency";
  }

  async *run(ctx: SessionContext): AsyncIterable<ScenarioEvent> {
    const { sessionId, signal } = ctx;

    yield {
      type: "path_started",
      eventId: `${this.pathId}-started-${sessionId}`,
      sessionId,
      pathId: this.pathId,
      timestamp: new Date().toISOString(),
    };

    const startWall = Date.now();
    let deliveredCount = 0;

    try {
      // Ensure the staging table exists for this session
      await this.execute(
        `CREATE TABLE IF NOT EXISTS lab_pg_polling_msgs (
          message_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );

      // Insert all messages
      const messageIds: string[] = [];
      for (let i = 0; i < this.messageCount; i++) {
        if (signal.aborted) break;
        const messageId = `${sessionId}-pgp-${i}`;
        messageIds.push(messageId);
        await this.execute(
          `INSERT INTO lab_pg_polling_msgs (message_id, session_id)
           VALUES ($1, $2)
           ON CONFLICT (message_id) DO NOTHING`,
          [messageId, sessionId],
        );
      }

      // Poll for rows + emit events
      const pending = new Set(messageIds);
      while (pending.size > 0 && !signal.aborted) {
        const recvAt = Date.now();
        const result = await this.execute(
          `SELECT message_id, inserted_at
           FROM lab_pg_polling_msgs
           WHERE session_id = $1
             AND message_id = ANY($2)`,
          [sessionId, Array.from(pending)],
        );

        for (const rawRow of result.rows as PollRow[]) {
          const msgId = rawRow.message_id;
          const insertedAt = new Date(rawRow.inserted_at).getTime();
          const latencyMs = Math.max(0, recvAt - insertedAt);
          pending.delete(msgId);
          deliveredCount += 1;

          yield {
            type: "message_delivered",
            eventId: `${this.pathId}-delivered-${msgId}`,
            sessionId,
            messageId: msgId,
            pathId: this.pathId,
            latencyMs,
            timestamp: new Date().toISOString(),
          };
        }

        if (pending.size > 0) {
          await sleep(this.pollIntervalMs);
        }
      }

      // Clean up session rows
      await this.execute(`DELETE FROM lab_pg_polling_msgs WHERE session_id = $1`, [sessionId]);

      const durationMs = Date.now() - startWall;

      yield {
        type: "path_completed",
        eventId: `${this.pathId}-completed-${sessionId}`,
        sessionId,
        pathId: this.pathId,
        deliveredCount,
        inversionCount: 0,
        durationMs,
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield {
        type: "path_failed",
        eventId: `${this.pathId}-failed-${sessionId}`,
        sessionId,
        pathId: this.pathId,
        reason,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
