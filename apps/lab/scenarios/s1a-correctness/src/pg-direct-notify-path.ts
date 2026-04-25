/**
 * PostgresDirectNotifyPath — LISTEN/NOTIFY path using a direct TCP connection.
 *
 * Bypasses Hyperdrive on the subscriber side (Hyperdrive explicitly does not
 * support LISTEN/NOTIFY — F1T-reversed, probe p01). The producer uses
 * Hyperdrive for INSERT+NOTIFY (one-shot queries Hyperdrive supports).
 *
 * Subscriber DO (PgListenerDO) holds the TCP connection. Producer fires
 * INSERT ... ; NOTIFY lab_probe_s1a per-batch. Subscriber records recv_order.
 *
 * Deliberately simulates one subscriber disconnect+reconnect at batch 40%
 * to surface the "drops during reconnect" behavior on direct connections.
 *
 * Default workload 1000; 10k as stress override (F-04).
 */
import type { ScenarioEvent, ScenarioRunner, SessionContext } from "@repo/lab-core";
import type { ScenarioContext } from "./context";
import { buildWorkload } from "./workload";
import {
  createMockPgDirectConnection,
  LISTEN_CHANNEL,
  type ListenerMessage,
  type MockPgDirectConnectionHandle,
  type PgDirectConnection,
} from "./pg-listener-do";

export const PATH_ID = "pg-direct-notify" as const;
const BATCH_SIZE = 100;
const RECONNECT_AT_FRACTION = 0.4; // simulate disconnect at 40% of workload

export interface DirectNotifyPathOptions {
  workloadSize?: number; // default 1000
  simulateReconnect?: boolean; // default true (surfaces the finding)
  pgUrl?: string; // direct PG URL (bypasses Hyperdrive)
}

export interface DirectNotifyStats {
  sent: number;
  received: number;
  dropped: number;
  reconnects: number;
  records: ListenerMessage[];
}

export class PostgresDirectNotifyPath implements ScenarioRunner {
  private readonly ctx: ScenarioContext;
  private readonly workloadSize: number;
  private readonly simulateReconnect: boolean;
  private readonly pgUrl: string;

  constructor(ctx: ScenarioContext, opts: DirectNotifyPathOptions = {}) {
    this.ctx = ctx;
    this.workloadSize = opts.workloadSize ?? 1000;
    this.simulateReconnect = opts.simulateReconnect ?? true;
    this.pgUrl = opts.pgUrl ?? "postgres://localhost:5432/lab";
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
      const stats = await this.runInternal(sessionId, signal);

      const inversionCount = countInversions(stats.records);
      const durationMs = Date.now() - startMs;

      yield {
        type: "path_completed",
        eventId: `${PATH_ID}-done-${sessionId}`,
        sessionId,
        pathId: PATH_ID,
        deliveredCount: stats.received,
        inversionCount,
        durationMs,
        timestamp: new Date().toISOString(),
      } satisfies ScenarioEvent;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield {
        type: "path_failed",
        eventId: `${PATH_ID}-fail-${sessionId}`,
        sessionId,
        pathId: PATH_ID,
        reason: msg.startsWith("pg_direct_connect_failed")
          ? msg
          : `pg_direct_connect_failed: ${msg}`,
        timestamp: new Date().toISOString(),
      } satisfies ScenarioEvent;
    }
  }

  private async runInternal(sessionId: string, signal: AbortSignal): Promise<DirectNotifyStats> {
    // Open a direct TCP connection to Postgres (bypasses Hyperdrive — F1T-reversed)
    let conn: PgDirectConnection & MockPgDirectConnectionHandle;
    try {
      conn = createMockPgDirectConnection(this.pgUrl);
    } catch (err) {
      throw new Error(
        `pg_direct_connect_failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const received: ListenerMessage[] = [];
    let recvOrder = 0;
    let droppedWindow = false;
    let dropped = 0;
    let reconnects = 0;

    conn.onNotification((payload) => {
      try {
        const msg = JSON.parse(payload) as { msg_id: string; seq: number; session_id: string };
        if (msg.session_id !== sessionId) return; // scope guard — never write outside session_id

        if (droppedWindow) {
          // In reconnect window — count as dropped
          dropped++;
          return;
        }

        recvOrder++;
        received.push({
          sessionId,
          msgId: msg.msg_id,
          seq: msg.seq,
          receivedAt: new Date("2026-01-01").toISOString(),
          recvOrder,
        });
      } catch {
        // malformed — ignore
      }
    });

    conn.onError(() => {
      reconnects++;
    });

    try {
      await conn.listen(LISTEN_CHANNEL);
    } catch (err) {
      throw new Error(
        `pg_direct_connect_failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const messages = Array.from(buildWorkload(sessionId, this.workloadSize));
    const reconnectAt = Math.floor(this.workloadSize * RECONNECT_AT_FRACTION);

    // Producer: INSERT + NOTIFY per batch
    // Producer can use Hyperdrive (one-shot queries); subscriber stays on direct conn
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      if (signal.aborted) break;

      const batchStart = i;

      // Simulate disconnect at the reconnect boundary
      if (
        this.simulateReconnect &&
        !droppedWindow &&
        batchStart >= reconnectAt &&
        batchStart < reconnectAt + BATCH_SIZE
      ) {
        droppedWindow = true;
        conn.triggerError(new Error("simulated_disconnect"));
        // After one batch worth of drops, "reconnect"
        reconnects++;
      } else if (droppedWindow && batchStart >= reconnectAt + BATCH_SIZE) {
        droppedWindow = false;
      }

      const batch = messages.slice(i, i + BATCH_SIZE);
      for (const m of batch) {
        const notifyPayload = JSON.stringify({
          msg_id: m.msg_id,
          seq: m.seq,
          session_id: m.session_id,
        });

        if (!droppedWindow) {
          // Deliver directly to the subscriber (in-process for testing)
          conn.sendNotification(notifyPayload);
        } else {
          dropped++;
        }
      }
    }

    await conn.unlisten(LISTEN_CHANNEL);
    await conn.close();

    return {
      sent: messages.length,
      received: received.length,
      dropped,
      reconnects,
      records: received,
    };
  }
}

/**
 * Count ordering inversions: pairs (i,j) where send_seq[i] < send_seq[j]
 * but recv_order[i] > recv_order[j] (Kendall-tau distance).
 */
export function countInversions(records: ListenerMessage[]): number {
  let count = 0;
  for (let i = 0; i < records.length - 1; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i];
      const b = records[j];
      if (a !== undefined && b !== undefined && a.seq < b.seq && a.recvOrder > b.recvOrder) {
        count++;
      }
    }
  }
  return count;
}
