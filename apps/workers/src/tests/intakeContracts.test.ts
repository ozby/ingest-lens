import { describe, expect, it } from "vitest";
import type { IntakeAttemptRecord, MappingSuggestionBatch } from "@repo/types";
import {
  calculatePayloadBytes,
  calculatePayloadDepth,
  classifyDriftCategory,
  getFixtureReference,
  getTargetContract,
  sourceKindFromFixtureId,
  validateDeliveryTarget,
} from "../intake/contracts";
import { validateMappingSuggestionBatch } from "../intake/validators";

function createBatch(): MappingSuggestionBatch {
  return {
    mappingTraceId: "trace-1",
    contractId: "job-posting-v1",
    contractVersion: "v1",
    sourceSystem: "ashby",
    promptVersion: "payload-mapping-v1",
    generatedAt: "2026-04-24T00:00:00.000Z",
    overallConfidence: 0.84,
    driftCategories: ["renamed_field"],
    missingRequiredFields: [],
    ambiguousTargetFields: [],
    summary: "Ready for review.",
    suggestions: [
      {
        id: "suggestion-1",
        sourcePath: "/title",
        targetField: "name",
        transformKind: "copy",
        confidence: 0.84,
        explanation: "title is the job title field.",
        evidenceSample: "Staff Software Engineer, Backend",
        deterministicValidation: {
          isValid: true,
          validatedAt: "2026-04-24T00:00:00.000Z",
          errors: [],
        },
        reviewStatus: "pending",
        replayStatus: "not_requested",
      },
    ],
  };
}

describe("intake contracts", () => {
  it("defines generic target contracts without hardcoding runtime-only globals", () => {
    expect(getTargetContract("job-posting-v1")).toEqual({
      id: "job-posting-v1",
      version: "v1",
      targetRecordType: "job_posting",
      targetFields: ["name", "status", "department", "location", "post_url", "employment_type"],
      requiredFields: ["name", "post_url"],
    });
  });

  it("rejects approval targets when queueId and topicId are both present", () => {
    expect(
      validateDeliveryTarget({
        queueId: "queue-1",
        topicId: "topic-1",
      }),
    ).toEqual(["Exactly one delivery target is required: queueId xor topicId."]);
  });

  it("rejects approval targets when both queueId and topicId are missing", () => {
    expect(validateDeliveryTarget({})).toEqual([
      "Exactly one delivery target is required: queueId xor topicId.",
    ]);
  });

  it("classifies ambiguity before missing-field drift", () => {
    expect(classifyDriftCategory(["post_url"], ["location"])).toBe("ambiguous_mapping");
  });

  it("looks up pinned public fixtures by id without storing them in shared types", () => {
    expect(getFixtureReference("greenhouse-job-001")?.sourceSystem).toBe("greenhouse");
  });

  it("tracks whether review data came from a fixture or inline payload", () => {
    expect(sourceKindFromFixtureId("ashby-job-001")).toBe("fixture_reference");
    expect(sourceKindFromFixtureId()).toBe("inline_payload");
  });

  it("computes payload depth and bytes for pre-AI validation", () => {
    expect(calculatePayloadDepth({ a: { b: ["c"] } })).toBe(3);
    expect(calculatePayloadBytes({ hello: "world" })).toBeGreaterThan(0);
  });

  it("rejects hallucinated sourcePath values before publish", () => {
    const batch = createBatch();
    batch.suggestions[0] = {
      ...batch.suggestions[0],
      sourcePath: "/missing/title",
    };

    expect(
      validateMappingSuggestionBatch(batch, {
        allowedTargetFields: ["name"],
        sourcePayload: { title: "Staff Software Engineer, Backend" },
      }),
    ).toEqual({
      ok: false,
      errors: ["/suggestions/0/sourcePath Segment 'missing' is outside the current payload."],
    });
  });

  it("round-trips a pending review attempt record", () => {
    const attempt: IntakeAttemptRecord = {
      intakeAttemptId: "attempt-1",
      mappingTraceId: "trace-1",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      sourceSystem: "ashby",
      sourceKind: "fixture_reference",
      sourceFixtureId: "ashby-job-001",
      sourceHash: "sha256:test",
      reviewPayloadExpiresAt: "2026-04-25T00:00:00.000Z",
      deliveryTarget: { queueId: "queue-1" },
      status: "pending_review",
      ingestStatus: "not_started",
      driftCategory: "renamed_field",
      modelName: "@cf/meta/llama-3.1-8b-instruct",
      promptVersion: "payload-mapping-v1",
      overallConfidence: 0.84,
      redactedSummary: "Fixture-backed review pending approval.",
      validationErrors: [],
      suggestionBatch: createBatch(),
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
    };

    expect(JSON.parse(JSON.stringify(attempt))).toEqual(attempt);
  });
});
