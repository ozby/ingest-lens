import { describe, expect, it } from "vitest";
import type { IntakeAttemptRecord } from "@repo/types";
import { buildIntakeLifecycleEvent, type IntakeTelemetryEvent } from "../telemetry";

const baseAttempt: IntakeAttemptRecord = Object.freeze({
  intakeAttemptId: "attempt-1",
  mappingTraceId: "trace-1",
  contractId: "contract-x-v1",
  contractVersion: "1",
  sourceSystem: "salesforce",
  sourceKind: "inline_payload",
  sourceHash: "hash-1",
  deliveryTarget: Object.freeze({ queueId: "queue-1" }),
  status: "pending_review",
  ingestStatus: "not_started",
  driftCategory: "renamed_field",
  modelName: "claude-opus",
  promptVersion: "v2026-01-01",
  overallConfidence: 0.82,
  redactedSummary: "summary",
  validationErrors: Object.freeze(["missing required field"]) as unknown as string[],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}) as IntakeAttemptRecord;

describe("buildIntakeLifecycleEvent", () => {
  it("builds the full 14-field payload for suggestion.created with a queue target", () => {
    const event = buildIntakeLifecycleEvent(baseAttempt, "suggestion.created");

    const expected: IntakeTelemetryEvent = {
      contractId: "contract-x-v1",
      deliveryTargetId: "queue-1",
      deliveryTargetKind: "queue",
      driftCategory: "renamed_field",
      event: "suggestion.created",
      ingestStatus: "not_started",
      mappingTraceId: "trace-1",
      modelName: "claude-opus",
      overallConfidence: 0.82,
      promptVersion: "v2026-01-01",
      sourceKind: "inline_payload",
      sourceSystem: "salesforce",
      status: "pending_review",
      validationErrorCount: 1,
    };
    expect(event).toEqual(expected);
  });

  it("builds the full 14-field payload for suggestion.ingest_failed with a topic target", () => {
    const failed: IntakeAttemptRecord = {
      ...baseAttempt,
      status: "ingest_failed",
      ingestStatus: "failed",
      deliveryTarget: { topicId: "topic-99" },
      validationErrors: [],
    };

    const event = buildIntakeLifecycleEvent(failed, "suggestion.ingest_failed");

    const expected: IntakeTelemetryEvent = {
      contractId: "contract-x-v1",
      deliveryTargetId: "topic-99",
      deliveryTargetKind: "topic",
      driftCategory: "renamed_field",
      event: "suggestion.ingest_failed",
      ingestStatus: "failed",
      mappingTraceId: "trace-1",
      modelName: "claude-opus",
      overallConfidence: 0.82,
      promptVersion: "v2026-01-01",
      sourceKind: "inline_payload",
      sourceSystem: "salesforce",
      status: "ingest_failed",
      validationErrorCount: 0,
    };
    expect(event).toEqual(expected);
  });

  it("builds the full 14-field payload for suggestion.ingested and falls back to unknown-target when both ids missing", () => {
    const ingested: IntakeAttemptRecord = {
      ...baseAttempt,
      status: "ingested",
      ingestStatus: "ingested",
      deliveryTarget: {},
    };

    const event = buildIntakeLifecycleEvent(ingested, "suggestion.ingested");

    const expected: IntakeTelemetryEvent = {
      contractId: "contract-x-v1",
      deliveryTargetId: "unknown-target",
      deliveryTargetKind: "topic",
      driftCategory: "renamed_field",
      event: "suggestion.ingested",
      ingestStatus: "ingested",
      mappingTraceId: "trace-1",
      modelName: "claude-opus",
      overallConfidence: 0.82,
      promptVersion: "v2026-01-01",
      sourceKind: "inline_payload",
      sourceSystem: "salesforce",
      status: "ingested",
      validationErrorCount: 1,
    };
    expect(event).toEqual(expected);
  });
});
