/**
 * PostgresDirectNotifyLatencyPath — Task 3.4
 *
 * Measures Postgres LISTEN/NOTIFY latency using a **direct TCP connection**
 * from a Durable Object (bypasses Hyperdrive — Hyperdrive does not support
 * LISTEN/NOTIFY, per probe p01).
 *
 * Design:
 *  - Subscriber connects directly via Workers `connect()` TCP API before the
 *    first INSERT.
 *  - Producer uses Hyperdrive (standard pg execute) for INSERT + NOTIFY.
 *  - Latency = recv_at - insert_at (both server-side Date.now() ms).
 *  - Simulates one subscriber disconnect at msg 4000 to expose reconnect cost.
 *  - Reconnect tail is visible in p99 (honest reporting, not smoothed).
 *
 * Note: Workers `connect()` returns a raw TCP Socket, not a full Postgres
 * driver. In unit tests this is mocked. In production it requires wrangler
 * `nodejs_compat` flag.
 */
import type { ScenarioRunner, SessionContext, ScenarioEvent } from "@repo/lab-core";

export interface DirectNotifyConfig {
  /** Producer executor (Hyperdrive-backed) for INSERT + pg_notify */
  execute: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  /**
   * Factory for a subscriber connection. Returns an object with
   * `listen(channel, cb)` and `end()` methods. Abstracted so tests can mock
   * the direct TCP subscriber without a real Postgres connection.
   */
  createSubscriber: () => Promise<PgSubscriber>;
  /** Number of messages. Default: 1000 */
  messageCount?: number;
  /** Message index at which to simulate one reconnect. Default: 400 (40% of 1k) */
  reconnectAtIndex?: number;
  /** Path identifier for events */
  pathId?: string;
}

export interface PgSubscriber {
  listen(channel: string, callback: (payload: string) => void): Promise<void>;
  end(): Promise<void>;
}

interface NotifyPayload {
  messageId: string;
  sentAt: number;
}

export class PostgresDirectNotifyLatencyPath implements ScenarioRunner {
  private readonly execute: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  private readonly createSubscriber: () => Promise<PgSubscriber>;
  private readonly messageCount: number;
  private readonly reconnectAtIndex: number;
  private readonly pathId: string;

  constructor(config: DirectNotifyConfig) {
    this.execute = config.execute;
    this.createSubscriber = config.createSubscriber;
    this.messageCount = config.messageCount ?? 1000;
    this.reconnectAtIndex =
      config.reconnectAtIndex ?? Math.floor((config.messageCount ?? 1000) * 0.4);
    this.pathId = config.pathId ?? "pg-direct-notify-latency";
  }

  async *run(ctx: SessionContext): AsyncIterable<ScenarioEvent> {
    const { sessionId, signal } = ctx;
    const channel = `lab_s1b_${sessionId.replace(/-/g, "_")}`;

    yield {
      type: "path_started",
      eventId: `${this.pathId}-started-${sessionId}`,
      sessionId,
      pathId: this.pathId,
      timestamp: new Date().toISOString(),
    };

    const startWall = Date.now();
    let deliveredCount = 0;
    // Use a ref box to avoid TS narrowing `subscriber` to `never` in finally block
    const subscriberRef: { current: PgSubscriber | null } = { current: null };

    // Pending resolution map: messageId → resolve(latencyMs)
    const pending = new Map<string, (latencyMs: number) => void>();

    const attachListener = async (): Promise<void> => {
      subscriberRef.current = await this.createSubscriber();
      await subscriberRef.current.listen(channel, (payload: string) => {
        const recvAt = Date.now();
        try {
          const data = JSON.parse(payload) as NotifyPayload;
          const latency = Math.max(0, recvAt - data.sentAt);
          const resolve = pending.get(data.messageId);
          if (resolve !== undefined) {
            resolve(latency);
            pending.delete(data.messageId);
          }
        } catch {
          // Malformed payload — skip
        }
      });
    };

    try {
      await attachListener();

      for (let i = 0; i < this.messageCount; i++) {
        if (signal.aborted) break;

        // Simulate subscriber reconnect at reconnectAtIndex
        if (i === this.reconnectAtIndex && subscriberRef.current !== null) {
          await subscriberRef.current.end();
          subscriberRef.current = null;
          // Reconnect — latency cost is honestly visible in the tail
          await attachListener();
        }

        const messageId = `${sessionId}-nfy-${i}`;
        const sentAt = Date.now();

        const latencyPromise = new Promise<number>((resolve) => {
          pending.set(messageId, resolve);
        });

        const notifyPayload = JSON.stringify({ messageId, sentAt });
        await this.execute(`SELECT pg_notify($1, $2)`, [channel, notifyPayload]);

        const latencyMs = await latencyPromise;
        deliveredCount += 1;

        yield {
          type: "message_delivered",
          eventId: `${this.pathId}-delivered-${i}-${sessionId}`,
          sessionId,
          messageId,
          pathId: this.pathId,
          latencyMs,
          timestamp: new Date().toISOString(),
        };
      }

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
    } finally {
      if (subscriberRef.current !== null) {
        await subscriberRef.current.end().catch(() => {
          // Best-effort cleanup
        });
      }
    }
  }
}
