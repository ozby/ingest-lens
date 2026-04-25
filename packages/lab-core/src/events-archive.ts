/**
 * EventsArchive — DB insert helper for lab.events_archive.
 *
 * Append-only. Archive failures MUST NOT block the live SSE stream.
 * Keyed by (sessionId, eventId) with monotonic per-session sequence.
 */
import type { SanitizedEvent } from "./contract";

export interface ArchiveRow {
  sessionId: string;
  eventId: string;
  seq: number;
  eventType: string;
  payload: string; // JSON
  createdAt: Date;
}

export interface ArchiveStore {
  insert(row: ArchiveRow): Promise<void>;
  queryFrom(sessionId: string, afterEventId: string): Promise<ArchiveRow[]>;
}

/**
 * In-memory archive implementation for testing.
 * Real implementations should use Drizzle + lab.events_archive table.
 */
export class InMemoryArchive implements ArchiveStore {
  private rows: ArchiveRow[] = [];

  async insert(row: ArchiveRow): Promise<void> {
    this.rows.push(row);
  }

  async queryFrom(sessionId: string, afterEventId: string): Promise<ArchiveRow[]> {
    const sessionRows = this.rows
      .filter((r) => r.sessionId === sessionId)
      .sort((a, b) => a.seq - b.seq);

    if (!afterEventId) return sessionRows;

    const afterIdx = sessionRows.findIndex((r) => r.eventId === afterEventId);
    if (afterIdx === -1) return sessionRows;
    return sessionRows.slice(afterIdx + 1);
  }

  all(): ArchiveRow[] {
    return [...this.rows];
  }
}

export function makeArchiveRow(
  event: SanitizedEvent,
  seq: number,
  createdAt: Date = new Date("2026-01-01"),
): ArchiveRow {
  return {
    sessionId: event.sessionId,
    eventId: event.eventId,
    seq,
    eventType: event.type,
    payload: JSON.stringify(event),
    createdAt,
  };
}
