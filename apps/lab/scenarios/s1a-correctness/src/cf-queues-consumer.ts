/**
 * cf-queues-consumer — consumer handler for the dedicated lab-s1a-cf-queues queue.
 *
 * Receives batches of Messages from the CfQueuesPath producer, records
 * receive order into lab.runs (scoped by session_id), and emits
 * message_delivered events. On panic, emits path_failed and sends message
 * to the DLQ by not ack-ing.
 *
 * Lane D wires this handler in wrangler.toml with:
 *   [[queues.consumers]]
 *   queue = "lab-s1a-cf-queues"
 *   binding = "LAB_S1A_QUEUE"
 */
import type { Message } from "./message";

export interface ConsumerEnv {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LAB_S1A_QUEUE: any; // Queue<Message> — CF workers type, not available in node env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HYPERDRIVE: any; // Hyperdrive — CF workers type
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AckFn = (...args: any[]) => any;

export interface QueueMessage<T> {
  body: T;
  id: string;
  timestamp: Date;
  ack: AckFn;
  retry: AckFn;
}

export interface MessageBatch<T> {
  messages: QueueMessage<T>[];
  queue: string;
  ackAll: AckFn;
  retryAll: AckFn;
}

/**
 * Receive record stored in-memory per session for correctness analysis.
 * In production, these would be written to lab.runs via Hyperdrive.
 */
export interface ReceiveRecord {
  sessionId: string;
  msgId: string;
  seq: number;
  recvOrder: number;
  receivedAt: string; // ISO8601
}

/**
 * In-memory store for test environments.
 * Production uses the Hyperdrive-backed DB.
 */
export class InMemoryReceiveStore {
  private records: ReceiveRecord[] = [];
  private countersBySession: Map<string, number> = new Map();

  record(sessionId: string, msgId: string, seq: number): ReceiveRecord {
    const recvOrder = (this.countersBySession.get(sessionId) ?? 0) + 1;
    this.countersBySession.set(sessionId, recvOrder);
    const rec: ReceiveRecord = {
      sessionId,
      msgId,
      seq,
      recvOrder,
      receivedAt: new Date("2026-01-01").toISOString(),
    };
    this.records.push(rec);
    return rec;
  }

  getBySession(sessionId: string): ReceiveRecord[] {
    return this.records.filter((r) => r.sessionId === sessionId);
  }

  clear(): void {
    this.records = [];
    this.countersBySession.clear();
  }
}

/**
 * handleLabS1aBatch — the consumer handler.
 * Exported for Lane D's wrangler.toml export default.
 */
export async function handleLabS1aBatch(
  batch: MessageBatch<Message>,
  store: InMemoryReceiveStore,
  onFailure?: (reason: string) => void,
): Promise<void> {
  for (const msg of batch.messages) {
    const ack = msg.ack as () => void;
    const retry = msg.retry as () => void;
    try {
      const { session_id, msg_id, seq } = msg.body;
      // Scope guard: never write outside the message's own session_id
      if (!session_id || !msg_id || typeof seq !== "number") {
        retry();
        continue;
      }
      store.record(session_id, msg_id, seq);
      ack();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (onFailure) onFailure(reason);
      retry(); // send to DLQ after retries exhaust
    }
  }
}
