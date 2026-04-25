/**
 * CfQueuesPath — producer side of the CF Queues correctness path.
 *
 * Enqueues messages in batches of 100 to the dedicated
 * `lab-s1a-cf-queues` queue (binding: LAB_S1A_QUEUE). Emits
 * ScenarioEvents for path lifecycle.
 *
 * Consumption is handled by the separate consumer handler
 * (cf-queues-consumer.ts) — exported for Lane D's wrangler.toml.
 *
 * F-3T: never touches the production DELIVERY_QUEUE.
 * F-04: default workload 1000; 10k available as stress override.
 */
import type { ScenarioEvent, ScenarioRunner, SessionContext } from "@repo/lab-core";
import type { ScenarioContext } from "./context";
import { buildWorkload } from "./workload";

export const PATH_ID = "cf-queues" as const;
const BATCH_SIZE = 100;

export interface CfQueuesPathOptions {
  workloadSize?: number; // default 1000
}

export class CfQueuesPath implements ScenarioRunner {
  private readonly ctx: ScenarioContext;
  private readonly workloadSize: number;

  constructor(ctx: ScenarioContext, opts: CfQueuesPathOptions = {}) {
    this.ctx = ctx;
    this.workloadSize = opts.workloadSize ?? 1000;
  }

  async *run(sessionCtx: SessionContext): AsyncIterable<ScenarioEvent> {
    const { sessionId, signal } = sessionCtx;
    const startedAt = new Date().toISOString();

    yield {
      type: "path_started",
      eventId: `${PATH_ID}-start-${sessionId}`,
      sessionId,
      pathId: PATH_ID,
      timestamp: startedAt,
    } satisfies ScenarioEvent;

    const startMs = Date.now();
    let enqueuedCount = 0;

    try {
      const messages = Array.from(buildWorkload(sessionId, this.workloadSize));

      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        if (signal.aborted) break;

        const batch = messages.slice(i, i + BATCH_SIZE);
        await this.ctx.labQueue.sendBatch(
          batch.map((m) => ({ body: m, contentType: "json" as const })),
        );
        enqueuedCount += batch.length;
      }

      const durationMs = Date.now() - startMs;

      yield {
        type: "path_completed",
        eventId: `${PATH_ID}-done-${sessionId}`,
        sessionId,
        pathId: PATH_ID,
        deliveredCount: enqueuedCount,
        inversionCount: 0, // consumer side tracks inversions
        durationMs,
        timestamp: new Date().toISOString(),
      } satisfies ScenarioEvent;
    } catch (err) {
      yield {
        type: "path_failed",
        eventId: `${PATH_ID}-fail-${sessionId}`,
        sessionId,
        pathId: PATH_ID,
        reason: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      } satisfies ScenarioEvent;
    }
  }
}
