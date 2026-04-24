import { describe, expect, it, vi } from "vitest";
import { buildIntakeTelemetryFields, recordIntakeLifecycle } from "../telemetry";
import { createMockEnv } from "./helpers";

describe("mapping telemetry", () => {
  it("emits only the allowlisted intake telemetry fields", () => {
    const fields = buildIntakeTelemetryFields({
      contractId: "job-posting-v1",
      deliveryTargetId: "queue-1",
      deliveryTargetKind: "queue",
      driftCategory: "renamed_field",
      event: "suggestion.created",
      ingestStatus: "not_started",
      mappingTraceId: "trace-1",
      modelName: "test-model",
      overallConfidence: 0.92,
      promptVersion: "payload-mapper-v1",
      sourceKind: "fixture_reference",
      sourceSystem: "ashby",
      status: "pending_review",
      validationErrorCount: 0,
    });

    expect(Object.keys(fields)).toEqual([
      "event",
      "status",
      "ingest_status",
      "mapping_trace_id",
      "contract_id",
      "source_system",
      "source_kind",
      "drift_category",
      "prompt_version",
      "model_name",
      "delivery_target_kind",
      "delivery_target_id",
      "overall_confidence",
      "validation_error_count",
    ]);
  });

  it("never forwards raw payload text to analytics", () => {
    const analytics = { writeDataPoint: vi.fn() };
    const env = createMockEnv(undefined, undefined, analytics);

    recordIntakeLifecycle(env, {
      contractId: "job-posting-v1",
      deliveryTargetId: "queue-1",
      deliveryTargetKind: "queue",
      driftCategory: "renamed_field",
      event: "suggestion.created",
      ingestStatus: "not_started",
      mappingTraceId: "trace-1",
      modelName: "test-model",
      overallConfidence: 0.92,
      promptVersion: "payload-mapper-v1",
      sourceKind: "inline_payload",
      sourceSystem: "manual",
      status: "pending_review",
      validationErrorCount: 0,
    });

    expect(analytics.writeDataPoint).toHaveBeenCalledOnce();
    const firstCall = analytics.writeDataPoint.mock.calls[0];
    if (!firstCall) throw new Error("Expected writeDataPoint to have been called");
    const [payload] = firstCall;
    expect(payload.blobs.join(" ")).not.toContain("Staff Software Engineer");
    expect(payload.blobs).toContain("trace-1");
  });
});
