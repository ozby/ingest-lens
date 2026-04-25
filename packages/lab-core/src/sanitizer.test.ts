import { describe, it, expect } from "vitest";
import { sanitize } from "./sanitizer";
import {
  fixPathStarted,
  fixMessageDelivered,
  fixInversionDetected,
  fixPathCompleted,
  fixPathFailed,
  fixRunCompleted,
  fixPathStartedWithLeak,
  fixMessageDeliveredWithLeak,
  fixRunCompletedWithLeak,
  fixUnknownEventType,
  fixMissingType,
  fixNullEvent,
  fixArrayEvent,
  fixEventWithNumericType,
} from "../test-fixtures/events";

type R = Record<string, unknown>;

describe("sanitize", () => {
  describe("known event shapes pass through with allowlisted fields only", () => {
    it("path_started: passes all allowed fields", () => {
      const result = sanitize(fixPathStarted) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["type"]).toBe("path_started");
      expect(result!["eventId"]).toBe("evt-001");
      expect(result!["sessionId"]).toBe("session-abc");
      expect(result!["pathId"]).toBe("path-1");
      expect(result!["timestamp"]).toBe("2026-01-01T00:00:00.000Z");
    });

    it("message_delivered: passes all allowed fields", () => {
      const result = sanitize(fixMessageDelivered) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["type"]).toBe("message_delivered");
      expect(result!["latencyMs"]).toBe(42);
    });

    it("inversion_detected: passes all allowed fields", () => {
      const result = sanitize(fixInversionDetected) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["type"]).toBe("inversion_detected");
      expect(result!["priorMessageId"]).toBe("msg-2");
      expect(result!["lateMessageId"]).toBe("msg-1");
    });

    it("path_completed: passes all allowed fields", () => {
      const result = sanitize(fixPathCompleted) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["type"]).toBe("path_completed");
      expect(result!["deliveredCount"]).toBe(100);
      expect(result!["inversionCount"]).toBe(2);
      expect(result!["durationMs"]).toBe(5000);
    });

    it("path_failed: passes all allowed fields", () => {
      const result = sanitize(fixPathFailed) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["type"]).toBe("path_failed");
      expect(result!["reason"]).toBe("Connection timeout");
    });

    it("run_completed: passes all allowed fields", () => {
      const result = sanitize(fixRunCompleted) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["type"]).toBe("run_completed");
      expect(result!["totalDelivered"]).toBe(100);
    });
  });

  describe("internal fields are stripped", () => {
    it("path_started with internal fields: strips _internalRowId, connectionString, workerFilePath, stack", () => {
      const result = sanitize(fixPathStartedWithLeak) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["_internalRowId"]).toBeUndefined();
      expect(result!["connectionString"]).toBeUndefined();
      expect(result!["workerFilePath"]).toBeUndefined();
      expect(result!["stack"]).toBeUndefined();
      // allowed fields still present
      expect(result!["type"]).toBe("path_started");
      expect(result!["eventId"]).toBe("evt-010");
    });

    it("message_delivered with internal fields: strips _pk, __internalQueue", () => {
      const result = sanitize(fixMessageDeliveredWithLeak) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["_pk"]).toBeUndefined();
      expect(result!["__internalQueue"]).toBeUndefined();
      expect(result!["latencyMs"]).toBe(10);
    });

    it("run_completed with internal fields: strips _dbHost, _secret", () => {
      const result = sanitize(fixRunCompletedWithLeak) as unknown as R | null;
      expect(result).not.toBeNull();
      expect(result!["_dbHost"]).toBeUndefined();
      expect(result!["_secret"]).toBeUndefined();
      expect(result!["totalDelivered"]).toBe(50);
    });
  });

  describe("unknown/malformed shapes return null", () => {
    it("unknown event type → null", () => {
      expect(sanitize(fixUnknownEventType)).toBeNull();
    });

    it("missing type field → null", () => {
      expect(sanitize(fixMissingType)).toBeNull();
    });

    it("null input → null", () => {
      expect(sanitize(fixNullEvent)).toBeNull();
    });

    it("array input → null", () => {
      expect(sanitize(fixArrayEvent)).toBeNull();
    });

    it("numeric type → null", () => {
      expect(sanitize(fixEventWithNumericType)).toBeNull();
    });

    it("primitive string → null", () => {
      expect(sanitize("just a string")).toBeNull();
    });

    it("empty object → null", () => {
      expect(sanitize({})).toBeNull();
    });
  });
});
