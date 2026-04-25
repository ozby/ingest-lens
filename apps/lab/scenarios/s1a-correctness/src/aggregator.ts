/**
 * aggregator — per-path summary + ordering classifier.
 *
 * Given the raw event stream for one path, returns:
 *   { delivered, duplicates, inversions, orderingProperty, status }
 *
 * Ordering classifier:
 *   inversions === 0 && duplicates === 0              → "FIFO"
 *   inversions === 0 && producers > 1                 → "FIFO per-producer"
 *   inversions > 0 && duplicates === 0                → "ordered with inversions"
 *   inversions > 0 && duplicates > 0                  → "unordered"
 *   delivered < sent                                   → status PARTIAL
 *   path_failed event in stream                       → status FAILED
 */
import type { PathCompletedEvent, PathFailedEvent, ScenarioEvent } from "@repo/lab-core";

export type OrderingProperty =
  | "FIFO"
  | "FIFO per-producer"
  | "ordered with inversions"
  | "unordered"
  | "unknown";
export type RunStatus = "OK" | "PARTIAL" | "FAILED";

export interface PathSummary {
  pathId: string;
  delivered: number;
  sent: number;
  duplicates: number;
  inversions: number;
  orderingProperty: OrderingProperty;
  status: RunStatus;
  durationMs: number;
  failureReason?: string;
}

export interface SummarizeOptions {
  producers?: number; // default 1
}

/**
 * summarize — reduce a flat array of ScenarioEvents for one path
 * into a PathSummary.
 */
export function summarize(
  events: ScenarioEvent[],
  sent: number,
  opts: SummarizeOptions = {},
): PathSummary {
  const producers = opts.producers ?? 1;

  // Find terminal events for the path
  const completed = events.find((e): e is PathCompletedEvent => e.type === "path_completed");
  const failed = events.find((e): e is PathFailedEvent => e.type === "path_failed");

  if (failed !== undefined) {
    return {
      pathId: failed.pathId,
      delivered: completed?.deliveredCount ?? 0,
      sent,
      duplicates: 0,
      inversions: completed?.inversionCount ?? 0,
      orderingProperty: "unknown",
      status: "FAILED",
      durationMs: completed?.durationMs ?? 0,
      failureReason: failed.reason,
    };
  }

  if (completed === undefined) {
    return {
      pathId:
        events[0]?.type === "path_started" ? (events[0] as { pathId: string }).pathId : "unknown",
      delivered: 0,
      sent,
      duplicates: 0,
      inversions: 0,
      orderingProperty: "unknown",
      status: "FAILED",
      durationMs: 0,
      failureReason: "no path_completed event",
    };
  }

  const delivered = completed.deliveredCount;
  const inversions = completed.inversionCount;

  // Duplicate detection: count message_delivered events with duplicate msg ids
  const deliveredIds = events
    .filter((e) => e.type === "message_delivered")
    .map((e) => (e as { messageId: string }).messageId);
  const uniqueIds = new Set(deliveredIds);
  const duplicates = deliveredIds.length - uniqueIds.size;

  const status: RunStatus = delivered < sent ? "PARTIAL" : "OK";

  const orderingProperty: OrderingProperty = classifyOrdering(inversions, duplicates, producers);

  return {
    pathId: completed.pathId,
    delivered,
    sent,
    duplicates,
    inversions,
    orderingProperty,
    status,
    durationMs: completed.durationMs,
  };
}

export function classifyOrdering(
  inversions: number,
  duplicates: number,
  producers: number,
): OrderingProperty {
  if (inversions === 0 && duplicates === 0 && producers <= 1) return "FIFO";
  if (inversions === 0 && producers > 1) return "FIFO per-producer";
  if (inversions > 0 && duplicates === 0) return "ordered with inversions";
  if (inversions > 0 && duplicates > 0) return "unordered";
  return "unknown";
}

/**
 * aggregateRun — combine per-path summaries into an overall run summary.
 */
export interface RunSummary {
  paths: PathSummary[];
  totalDelivered: number;
  totalInversions: number;
  overallStatus: RunStatus;
  durationMs: number;
}

export function aggregateRun(paths: PathSummary[], durationMs: number): RunSummary {
  const totalDelivered = paths.reduce((acc, p) => acc + p.delivered, 0);
  const totalInversions = paths.reduce((acc, p) => acc + p.inversions, 0);
  const overallStatus: RunStatus = paths.every((p) => p.status === "OK")
    ? "OK"
    : paths.some((p) => p.status === "FAILED")
      ? "FAILED"
      : "PARTIAL";

  return { paths, totalDelivered, totalInversions, overallStatus, durationMs };
}
