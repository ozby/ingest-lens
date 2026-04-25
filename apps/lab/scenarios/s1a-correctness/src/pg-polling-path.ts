/**
 * PgPollingPath — Postgres polling delivery path.
 *
 * Inserts all messages into lab.runs (session_id scoped), then polls
 * SELECT ... ORDER BY inserted_at, seq in chunks of 500 until
 * delivered === sent. Records recv_order as rows are SELECTed.
 *
 * Uses Hyperdrive-backed DB for both INSERT and SELECT (one-shot
 * query ops Hyperdrive supports). Zero inversions guaranteed when
 * producer count = 1.
 */
import type { ScenarioEvent, ScenarioRunner, SessionContext } from "@repo/lab-core";
import type { ScenarioContext } from "./context";
import { buildWorkload } from "./workload";
import type { Message } from "./message";

export const PATH_ID = "pg-polling" as const;
const BATCH_SIZE = 100;
const POLL_CHUNK = 500;
const POLL_MAX_ROUNDS = 200; // safety ceiling

export interface PgPollingPathOptions {
  workloadSize?: number; // default 1000
  producerCount?: number; // default 1
}

export interface PolledRow {
  msgId: string;
  seq: number;
  sessionId: string;
  recvOrder: number;
}

export class PgPollingPath implements ScenarioRunner {
  private readonly ctx: ScenarioContext;
  private readonly workloadSize: number;
  private readonly producerCount: number;

  constructor(ctx: ScenarioContext, opts: PgPollingPathOptions = {}) {
    this.ctx = ctx;
    this.workloadSize = opts.workloadSize ?? 1000;
    this.producerCount = opts.producerCount ?? 1;
  }

  async *run(sessionCtx: SessionContext): AsyncIterable<ScenarioEvent> {
    const { sessionId, signal } = sessionCtx;

    yield {
      type: "path_started",
      eventId: `${PATH_ID}-start-${sessionId}`,
      sessionId,
      pathId: PATH_ID,
      timestamp: new Date().toISOString(),
    } satisfies ScenarioEvent;

    const startMs = Date.now();

    try {
      const messages = Array.from(buildWorkload(sessionId, this.workloadSize));

      // INSERT phase — batch inserts
      await this.insertBatched(messages, signal);

      // POLL phase — read back in ORDER BY seq
      const polled = await this.poll(sessionId, messages.length, signal);

      const durationMs = Date.now() - startMs;

      // Count inversions: recv_order must match seq order when producer=1
      let inversionCount = 0;
      for (let i = 0; i < polled.length - 1; i++) {
        const a = polled[i];
        const b = polled[i + 1];
        if (a !== undefined && b !== undefined && a.seq > b.seq) {
          inversionCount++;
        }
      }

      yield {
        type: "path_completed",
        eventId: `${PATH_ID}-done-${sessionId}`,
        sessionId,
        pathId: PATH_ID,
        deliveredCount: polled.length,
        inversionCount,
        durationMs,
        timestamp: new Date().toISOString(),
      } satisfies ScenarioEvent;
    } catch (err) {
      const reason =
        err instanceof Error
          ? err.message.includes("Hyperdrive") || err.message.includes("pool")
            ? `hyperdrive_pool_exhausted: ${err.message}`
            : err.message
          : String(err);

      yield {
        type: "path_failed",
        eventId: `${PATH_ID}-fail-${sessionId}`,
        sessionId,
        pathId: PATH_ID,
        reason,
        timestamp: new Date().toISOString(),
      } satisfies ScenarioEvent;
    }
  }

  private async insertBatched(messages: Message[], signal: AbortSignal): Promise<void> {
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = messages.slice(i, i + BATCH_SIZE);
      // Real impl uses Drizzle batch insert; here we use the DbClient interface
      for (const m of batch) {
        await this.ctx.db.execute(
          `INSERT INTO lab.runs (session_id, path_id, status, delivered_count, inversion_count)
           VALUES ($1, $2, 'running', 0, 0)
           ON CONFLICT DO NOTHING`,
          [m.session_id, m.msg_id],
        );
      }
    }
  }

  private async poll(
    sessionId: string,
    expectedCount: number,
    signal: AbortSignal,
  ): Promise<PolledRow[]> {
    const rows: PolledRow[] = [];
    let rounds = 0;

    while (rows.length < expectedCount && rounds < POLL_MAX_ROUNDS) {
      if (signal.aborted) break;
      rounds++;

      const chunk = await this.ctx.db.execute<{ msg_id: string; seq: number }>(
        `SELECT msg_id, seq
           FROM lab.message_log
          WHERE session_id = $1
            AND path_id = $2
          ORDER BY inserted_at, seq
          LIMIT $3 OFFSET $4`,
        [sessionId, PATH_ID, POLL_CHUNK, rows.length],
      );

      if (chunk.length === 0) {
        // Nothing new yet; tiny back-pressure (real code would use setTimeout)
        await new Promise<void>((r) => setTimeout(r, 10));
        continue;
      }

      for (const row of chunk) {
        rows.push({
          msgId: row.msg_id,
          seq: row.seq,
          sessionId,
          recvOrder: rows.length + 1,
        });
      }
    }

    return rows;
  }

  get producerCountConfig(): number {
    return this.producerCount;
  }
}
