/**
 * TelemetryCollector — stateful batcher for ScenarioEvents.
 *
 * Responsibilities:
 * 1. Accept raw ScenarioEvents from the runner
 * 2. Sanitize each event
 * 3. Batch to ~10Hz (100ms cadence) or 64 events max per batch
 * 4. Persist every event to lab.events_archive (best-effort; archive failures
 *    MUST NOT block the live SSE stream — F-05)
 * 5. Expose AsyncIterable<SanitizedEvent[]> for live SSE
 * 6. Expose replayFrom(sessionId, lastEventId) for SSE reconnect
 *
 * The collector is NOT a Durable Object — it runs in the Worker context.
 */
import type { ScenarioEvent, SanitizedEvent } from "./contract";
import { sanitize } from "./sanitizer";
import type { ArchiveStore } from "./events-archive";
import { makeArchiveRow } from "./events-archive";

export interface TelemetryCollectorOptions {
  cadenceMs?: number; // default 100ms (~10Hz)
  maxBatchSize?: number; // default 64
  archive?: ArchiveStore; // optional; if absent, archive is skipped
}

export class TelemetryCollector {
  private readonly cadenceMs: number;
  private readonly maxBatchSize: number;
  private readonly archive: ArchiveStore | null;
  private pending: SanitizedEvent[] = [];
  private seqBySession: Map<string, number> = new Map();
  private closed = false;
  private resolveFlush: (() => void) | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: TelemetryCollectorOptions = {}) {
    this.cadenceMs = opts.cadenceMs ?? 100;
    this.maxBatchSize = opts.maxBatchSize ?? 64;
    this.archive = opts.archive ?? null;
  }

  /**
   * Push a raw event into the collector.
   * Returns true if the event passed sanitization, false if dropped.
   */
  push(event: ScenarioEvent): boolean {
    const sanitized = sanitize(event);
    if (sanitized === null) return false;

    this.pending.push(sanitized);

    // Persist to archive best-effort (do not await — fire and forget)
    if (this.archive !== null) {
      const sessionId = sanitized.sessionId;
      const seq = (this.seqBySession.get(sessionId) ?? 0) + 1;
      this.seqBySession.set(sessionId, seq);
      const row = makeArchiveRow(sanitized, seq);
      void this.archive.insert(row).catch(() => {
        // Archive failure must not block the live stream (F-05)
      });
    }

    // Trigger immediate flush if max batch size reached
    if (this.pending.length >= this.maxBatchSize) {
      this.triggerFlush();
    }

    return true;
  }

  /**
   * Close the collector. Pending events are flushed on the next iteration.
   */
  close(): void {
    this.closed = true;
    this.triggerFlush();
  }

  /**
   * Live SSE stream: AsyncIterable<SanitizedEvent[]>.
   * Each iteration yields one batch. Ends when close() is called and no
   * more pending events remain.
   */
  async *stream(): AsyncIterable<SanitizedEvent[]> {
    while (!this.closed || this.pending.length > 0) {
      await this.waitForFlush();
      if (this.pending.length === 0) {
        if (this.closed) break;
        continue;
      }
      const batch = this.pending.splice(0, this.maxBatchSize);
      if (batch.length > 0) yield batch;
    }
  }

  /**
   * Replay from archive: AsyncIterable<SanitizedEvent>.
   * Returns events after lastEventId in monotonic order.
   */
  async *replayFrom(sessionId: string, lastEventId: string): AsyncIterable<SanitizedEvent> {
    if (this.archive === null) return;
    const rows = await this.archive.queryFrom(sessionId, lastEventId);
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as SanitizedEvent;
      yield parsed;
    }
  }

  private triggerFlush(): void {
    if (this.resolveFlush !== null) {
      this.resolveFlush();
      this.resolveFlush = null;
    }
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private waitForFlush(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.closed) {
        resolve();
        return;
      }
      this.resolveFlush = resolve;
      this.flushTimer = setTimeout(() => {
        this.resolveFlush = null;
        this.flushTimer = null;
        resolve();
      }, this.cadenceMs);
    });
  }
}
