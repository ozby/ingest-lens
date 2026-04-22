import type { Env } from "./db/client";

export type DeliveryStatus = "ack" | "retry" | "dropped";

export interface RecordDeliveryOptions {
  queueId: string;
  messageId: string;
  topicId: string | null;
  status: DeliveryStatus;
  latencyMs: number;
  attempt: number;
}

export function recordDelivery(env: Env, opts: RecordDeliveryOptions): void {
  try {
    env.ANALYTICS.writeDataPoint({
      blobs: [opts.queueId, opts.messageId, opts.status, opts.topicId ?? ""],
      doubles: [opts.latencyMs, opts.attempt],
      indexes: [opts.queueId],
    });
  } catch {
    // best-effort: telemetry failure must never break delivery
  }
}
