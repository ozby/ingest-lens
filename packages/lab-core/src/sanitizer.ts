/**
 * Sanitizer — allowlist-based event filter.
 *
 * Default-deny: unknown event shapes return null.
 * No internal fields (row PKs, stack traces, connection strings) can leak.
 */
import type { ScenarioEvent, SanitizedEvent } from "./contract";

// ---------------------------------------------------------------------------
// Allowlist definitions — only these fields pass through per event type
// ---------------------------------------------------------------------------

type AllowedFields<T> = (keyof T)[];

const PATH_STARTED_FIELDS: AllowedFields<{
  type: string;
  eventId: string;
  sessionId: string;
  pathId: string;
  timestamp: string;
}> = ["type", "eventId", "sessionId", "pathId", "timestamp"];

const MESSAGE_DELIVERED_FIELDS: AllowedFields<{
  type: string;
  eventId: string;
  sessionId: string;
  messageId: string;
  pathId: string;
  latencyMs: number;
  timestamp: string;
}> = ["type", "eventId", "sessionId", "messageId", "pathId", "latencyMs", "timestamp"];

const INVERSION_DETECTED_FIELDS: AllowedFields<{
  type: string;
  eventId: string;
  sessionId: string;
  pathId: string;
  priorMessageId: string;
  lateMessageId: string;
  timestamp: string;
}> = ["type", "eventId", "sessionId", "pathId", "priorMessageId", "lateMessageId", "timestamp"];

const PATH_COMPLETED_FIELDS: AllowedFields<{
  type: string;
  eventId: string;
  sessionId: string;
  pathId: string;
  deliveredCount: number;
  inversionCount: number;
  durationMs: number;
  timestamp: string;
}> = [
  "type",
  "eventId",
  "sessionId",
  "pathId",
  "deliveredCount",
  "inversionCount",
  "durationMs",
  "timestamp",
];

const PATH_FAILED_FIELDS: AllowedFields<{
  type: string;
  eventId: string;
  sessionId: string;
  pathId: string;
  reason: string;
  timestamp: string;
}> = ["type", "eventId", "sessionId", "pathId", "reason", "timestamp"];

const RUN_COMPLETED_FIELDS: AllowedFields<{
  type: string;
  eventId: string;
  sessionId: string;
  totalDelivered: number;
  totalInversions: number;
  durationMs: number;
  timestamp: string;
}> = [
  "type",
  "eventId",
  "sessionId",
  "totalDelivered",
  "totalInversions",
  "durationMs",
  "timestamp",
];

const ALLOWLIST: Record<string, string[]> = {
  path_started: PATH_STARTED_FIELDS as string[],
  message_delivered: MESSAGE_DELIVERED_FIELDS as string[],
  inversion_detected: INVERSION_DETECTED_FIELDS as string[],
  path_completed: PATH_COMPLETED_FIELDS as string[],
  path_failed: PATH_FAILED_FIELDS as string[],
  run_completed: RUN_COMPLETED_FIELDS as string[],
};

// ---------------------------------------------------------------------------
// Sanitize function
// ---------------------------------------------------------------------------

export function sanitize(event: unknown): SanitizedEvent | null {
  if (event === null || typeof event !== "object") return null;
  const raw = event as Record<string, unknown>;
  const type = raw["type"];
  if (typeof type !== "string") return null;

  const allowed = ALLOWLIST[type];
  if (!allowed) return null; // unknown type → default-deny

  const sanitized: Record<string, unknown> = {};
  for (const field of allowed) {
    if (field in raw) {
      sanitized[field] = raw[field];
    }
  }
  return sanitized as unknown as SanitizedEvent;
}

// Re-export for consumers that want type-only usage
export type { ScenarioEvent };
