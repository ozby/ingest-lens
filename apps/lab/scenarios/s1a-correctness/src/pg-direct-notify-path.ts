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

function openDirectConnection(pgUrl: string): PgDirectConnection & MockPgDirectConnectionHandle {
  try {
    return createMockPgDirectConnection(pgUrl);
  } catch (err) {
    throw new Error(
      `pg_direct_connect_failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function listenOnConnection(conn: PgDirectConnection): Promise<void> {
  try {
    await conn.listen(LISTEN_CHANNEL);
  } catch (err) {
    throw new Error(
      `pg_direct_connect_failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

interface DeliveryCounters {
  dropped: number;
  reconnects: number;
  droppedWindow: boolean;
}

function deliverMessages(
  messages: Array<{ msg_id: string; seq: number; session_id: string }>,
  signal: AbortSignal,
  simulateReconnect: boolean,
  reconnectAt: number,
  conn: PgDirectConnection & MockPgDirectConnectionHandle,
  counters: DeliveryCounters,
): void {
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    if (signal.aborted) break;
    const result = maybeSimulateReconnect(
      simulateReconnect,
      counters.droppedWindow,
      i,
      reconnectAt,
      conn,
    );
    if (result === "open") {
      counters.droppedWindow = true;
      counters.reconnects++;
    } else if (result === "close") {
      counters.droppedWindow = false;
    }
    for (const m of messages.slice(i, i + BATCH_SIZE)) {
      const payload = JSON.stringify({ msg_id: m.msg_id, seq: m.seq, session_id: m.session_id });
      if (!counters.droppedWindow) {
        conn.sendNotification(payload);
      } else {
        counters.dropped++;
      }
    }
  }
}

function handleNotification(
  payload: string,
  sessionId: string,
  droppedWindow: boolean,
  received: ListenerMessage[],
  onDrop: () => void,
  nextOrder: () => number,
): void {
  try {
    const msg = JSON.parse(payload) as { msg_id: string; seq: number; session_id: string };
    if (msg.session_id !== sessionId) return;
    if (droppedWindow) {
      onDrop();
      return;
    }
    const recvOrder = nextOrder();
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
}

function maybeSimulateReconnect(
  simulateReconnect: boolean,
  droppedWindow: boolean,
  batchStart: number,
  reconnectAt: number,
  conn: { triggerError(err: Error): void },
): "open" | "close" | "none" {
  if (
    simulateReconnect &&
    !droppedWindow &&
    batchStart >= reconnectAt &&
    batchStart < reconnectAt + BATCH_SIZE
  ) {
    conn.triggerError(new Error("simulated_disconnect"));
    return "open";
  }
  if (droppedWindow && batchStart >= reconnectAt + BATCH_SIZE) {
    return "close";
  }
  return "none";
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
    const conn = openDirectConnection(this.pgUrl);
    const received: ListenerMessage[] = [];
    let recvOrder = 0;
    let droppedWindow = false;
    let dropped = 0;
    let reconnects = 0;

    conn.onNotification((payload) => {
      handleNotification(
        payload,
        sessionId,
        droppedWindow,
        received,
        () => {
          dropped++;
        },
        () => {
          recvOrder++;
          return recvOrder;
        },
      );
    });
    conn.onError(() => {
      reconnects++;
    });
    await listenOnConnection(conn);

    const messages = Array.from(buildWorkload(sessionId, this.workloadSize));
    const reconnectAt = Math.floor(this.workloadSize * RECONNECT_AT_FRACTION);
    const counters = { dropped, reconnects, droppedWindow };

    deliverMessages(messages, signal, this.simulateReconnect, reconnectAt, conn, counters);
    dropped = counters.dropped;
    reconnects = counters.reconnects;

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
