/**
 * CfQueuesLatencyPath — Task 3.2
 *
 * Measures CF Queues end-to-end latency:
 *   producer enqueues at t0, consumer records t1 on receive,
 *   latency = t1 - t0 (ms).
 *
 * Uses dedicated queue `lab-s1b-cf-queues` (+ DLQ `lab-s1b-cf-queues-dlq`).
 * One consumer per queue (F-3T). Default workload: 1k messages.
 */
import type { ScenarioRunner, SessionContext, ScenarioEvent } from "@repo/lab-core";

export interface CfQueuesLatencyConfig {
  /** Queue binding — call site passes `env.LAB_S1B_QUEUE` */
  queue: Queue;
  /** Number of messages to send. Default: 1000 */
  messageCount?: number;
  /** Path identifier for events */
  pathId?: string;
}

export interface LatencyRecord {
  messageId: string;
  sentAt: number; // Date.now() ms
  receivedAt: number; // Date.now() ms
  latencyMs: number;
}

/** Shared in-flight registry so the consumer handler can record received times */
const inFlight = new Map<string, { sentAt: number; resolve: (latency: number) => void }>();

/**
 * Called by the CF Queues consumer worker when a message arrives.
 * Resolves the pending promise in `inFlight`, recording `receivedAt`.
 */
export function handleQueueMessage(messageId: string): void {
  const entry = inFlight.get(messageId);
  if (entry === undefined) return;
  const receivedAt = Date.now();
  const latency = Math.max(0, receivedAt - entry.sentAt);
  entry.resolve(latency);
  inFlight.delete(messageId);
}

export class CfQueuesLatencyPath implements ScenarioRunner {
  private readonly queue: Queue;
  private readonly messageCount: number;
  private readonly pathId: string;

  constructor(config: CfQueuesLatencyConfig) {
    this.queue = config.queue;
    this.messageCount = config.messageCount ?? 1000;
    this.pathId = config.pathId ?? "cf-queues-latency";
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

    const latencies: number[] = [];
    const startWall = Date.now();

    try {
      for (let i = 0; i < this.messageCount; i++) {
        if (signal.aborted) break;

        const messageId = `${sessionId}-cfq-${i}`;
        const sentAt = Date.now();

        const latencyPromise = new Promise<number>((resolve) => {
          inFlight.set(messageId, { sentAt, resolve });
        });

        await this.queue.send({ messageId, sentAt }, { contentType: "json" });

        const latencyMs = await latencyPromise;
        latencies.push(latencyMs);

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
        deliveredCount: latencies.length,
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
