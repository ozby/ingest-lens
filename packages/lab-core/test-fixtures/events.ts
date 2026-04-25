/**
 * Test fixtures for ScenarioEvent types.
 * All exported fixtures are deepFrozen per CLAUDE.md conventions.
 */
import type {
  PathStartedEvent,
  MessageDeliveredEvent,
  InversionDetectedEvent,
  PathCompletedEvent,
  PathFailedEvent,
  RunCompletedEvent,
} from "../src/contract";

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === "object") {
      deepFreeze(value as object);
    }
  }
  return obj as Readonly<T>;
}

export const fixPathStarted: PathStartedEvent = deepFreeze({
  type: "path_started",
  eventId: "evt-001",
  sessionId: "session-abc",
  pathId: "path-1",
  timestamp: "2026-01-01T00:00:00.000Z",
});

export const fixMessageDelivered: MessageDeliveredEvent = deepFreeze({
  type: "message_delivered",
  eventId: "evt-002",
  sessionId: "session-abc",
  messageId: "msg-1",
  pathId: "path-1",
  latencyMs: 42,
  timestamp: "2026-01-01T00:00:01.000Z",
});

export const fixInversionDetected: InversionDetectedEvent = deepFreeze({
  type: "inversion_detected",
  eventId: "evt-003",
  sessionId: "session-abc",
  pathId: "path-1",
  priorMessageId: "msg-2",
  lateMessageId: "msg-1",
  timestamp: "2026-01-01T00:00:02.000Z",
});

export const fixPathCompleted: PathCompletedEvent = deepFreeze({
  type: "path_completed",
  eventId: "evt-004",
  sessionId: "session-abc",
  pathId: "path-1",
  deliveredCount: 100,
  inversionCount: 2,
  durationMs: 5000,
  timestamp: "2026-01-01T00:00:05.000Z",
});

export const fixPathFailed: PathFailedEvent = deepFreeze({
  type: "path_failed",
  eventId: "evt-005",
  sessionId: "session-abc",
  pathId: "path-2",
  reason: "Connection timeout",
  timestamp: "2026-01-01T00:00:06.000Z",
});

export const fixRunCompleted: RunCompletedEvent = deepFreeze({
  type: "run_completed",
  eventId: "evt-006",
  sessionId: "session-abc",
  totalDelivered: 100,
  totalInversions: 2,
  durationMs: 6000,
  timestamp: "2026-01-01T00:00:06.000Z",
});

// Events with extra internal fields that should be stripped
export const fixPathStartedWithLeak = deepFreeze({
  type: "path_started",
  eventId: "evt-010",
  sessionId: "session-abc",
  pathId: "path-1",
  timestamp: "2026-01-01T00:00:00.000Z",
  // Internal fields — must NOT appear in sanitized output
  _internalRowId: 42,
  connectionString: "postgres://user:pass@internal-host/db",
  workerFilePath: "/Users/dev/.local/worker/index.js",
  stack: "Error: foo\n    at /worker/index.js:42",
});

export const fixMessageDeliveredWithLeak = deepFreeze({
  type: "message_delivered",
  eventId: "evt-011",
  sessionId: "session-abc",
  messageId: "msg-999",
  pathId: "path-1",
  latencyMs: 10,
  timestamp: "2026-01-01T00:00:01.000Z",
  _pk: 9999,
  __internalQueue: "internal-queue-name",
});

export const fixRunCompletedWithLeak = deepFreeze({
  type: "run_completed",
  eventId: "evt-012",
  sessionId: "session-abc",
  totalDelivered: 50,
  totalInversions: 0,
  durationMs: 3000,
  timestamp: "2026-01-01T00:00:03.000Z",
  _dbHost: "neon.tech",
  _secret: "should-not-appear",
});

// Malformed / unknown event shapes
export const fixUnknownEventType = deepFreeze({
  type: "unknown_event_type",
  eventId: "evt-020",
  sessionId: "session-abc",
  timestamp: "2026-01-01T00:00:00.000Z",
});

export const fixMissingType = deepFreeze({
  eventId: "evt-021",
  sessionId: "session-abc",
  timestamp: "2026-01-01T00:00:00.000Z",
});

export const fixNullEvent = null;

export const fixArrayEvent = deepFreeze([{ type: "path_started" }]);

export const fixEventWithNumericType = deepFreeze({
  type: 42,
  eventId: "evt-022",
});
