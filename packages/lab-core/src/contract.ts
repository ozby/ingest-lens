/**
 * Contract types for the consistency lab runner.
 * These are pure TypeScript types — no implementation, no runtime cost.
 */

export type SessionId = string;
export type EventId = string;

// ---------------------------------------------------------------------------
// Session context
// ---------------------------------------------------------------------------

export interface SessionContext {
  sessionId: SessionId;
  signal: AbortSignal;
}

// ---------------------------------------------------------------------------
// Scenario events (discriminated union)
// ---------------------------------------------------------------------------

export interface PathStartedEvent {
  type: "path_started";
  eventId: EventId;
  sessionId: SessionId;
  pathId: string;
  timestamp: string; // ISO8601
}

export interface MessageDeliveredEvent {
  type: "message_delivered";
  eventId: EventId;
  sessionId: SessionId;
  messageId: string;
  pathId: string;
  latencyMs: number;
  timestamp: string;
}

export interface InversionDetectedEvent {
  type: "inversion_detected";
  eventId: EventId;
  sessionId: SessionId;
  pathId: string;
  priorMessageId: string;
  lateMessageId: string;
  timestamp: string;
}

export interface PathCompletedEvent {
  type: "path_completed";
  eventId: EventId;
  sessionId: SessionId;
  pathId: string;
  deliveredCount: number;
  inversionCount: number;
  durationMs: number;
  timestamp: string;
}

export interface PathFailedEvent {
  type: "path_failed";
  eventId: EventId;
  sessionId: SessionId;
  pathId: string;
  reason: string;
  timestamp: string;
}

export interface RunCompletedEvent {
  type: "run_completed";
  eventId: EventId;
  sessionId: SessionId;
  totalDelivered: number;
  totalInversions: number;
  durationMs: number;
  timestamp: string;
}

export type ScenarioEvent =
  | PathStartedEvent
  | MessageDeliveredEvent
  | InversionDetectedEvent
  | PathCompletedEvent
  | PathFailedEvent
  | RunCompletedEvent;

// ---------------------------------------------------------------------------
// Sanitized events — same shapes but guaranteed clean
// ---------------------------------------------------------------------------

export type SanitizedEvent = ScenarioEvent;

// ---------------------------------------------------------------------------
// Runner interface
// ---------------------------------------------------------------------------

export interface ScenarioRunner {
  run(ctx: SessionContext): AsyncIterable<ScenarioEvent>;
}
