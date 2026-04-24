import { describe, expect, it } from "vitest";
import { brandNormalizedEnvelope } from "./IntakeMapping";
import type {
  ApprovedMappingRevision,
  IntakeAttemptRecord,
  JudgeAssessment,
  MappingSuggestion,
  MappingSuggestionBatch,
  ReplayPlan,
} from "./IntakeMapping";

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Intake mapping contracts", () => {
  it("serializes a pending suggestion batch round-trip", () => {
    const batch: MappingSuggestionBatch = {
      mappingTraceId: "trace-pending",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      sourceSystem: "ashby",
      promptVersion: "payload-mapping-v1",
      generatedAt: "2026-04-24T00:00:00.000Z",
      overallConfidence: 0.82,
      driftCategories: ["renamed_field"],
      missingRequiredFields: ["applyUrl"],
      ambiguousTargetFields: ["department"],
      summary: "Review required before promotion.",
      suggestions: [
        {
          id: "suggestion-pending",
          sourcePath: "/company/name",
          targetField: "companyName",
          transformKind: "copy",
          confidence: 0.82,
          explanation: "The source field is a direct semantic match.",
          evidenceSample: "Acme, Inc.",
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

    expect(roundTrip(batch)).toEqual(batch);
  });

  it("serializes an approved suggestion with judge assessment", () => {
    const judgeAssessment: JudgeAssessment = {
      verdict: "agree",
      concerns: [],
      confidence: 0.77,
      recommendedAction: "approve",
      explanation: "The mapping is coherent with the contract fields.",
    };

    const suggestion: MappingSuggestion = {
      id: "suggestion-approved",
      sourcePath: "/location/city",
      targetField: "locations[0].city",
      transformKind: "copy",
      confidence: 0.91,
      explanation: "Source and target both represent the city.",
      evidenceSample: "Berlin",
      deterministicValidation: {
        isValid: true,
        validatedAt: "2026-04-24T00:05:00.000Z",
        errors: [],
      },
      judgeAssessment,
      reviewStatus: "approved",
      replayStatus: "pending",
    };

    expect(roundTrip(suggestion)).toEqual(suggestion);
  });

  it("serializes a rejected suggestion and preserves validation failures", () => {
    const suggestion: MappingSuggestion = {
      id: "suggestion-rejected",
      sourcePath: "/description",
      targetField: "salaryRange",
      transformKind: "copy",
      confidence: 0.31,
      explanation: "The description mentioned compensation details.",
      evidenceSample: "Salary depends on location.",
      deterministicValidation: {
        isValid: false,
        validatedAt: "2026-04-24T00:10:00.000Z",
        errors: ["targetField is not available in the active contract"],
      },
      judgeAssessment: {
        verdict: "warn",
        concerns: ["The field is inferred from free-form text."],
        confidence: 0.42,
        recommendedAction: "reject",
        explanation: "The mapping would need human rewrite before approval.",
      },
      reviewStatus: "rejected",
      replayStatus: "not_requested",
    };

    expect(roundTrip(suggestion)).toEqual(suggestion);
  });

  it("serializes a replayed plan round-trip", () => {
    const replayPlan: ReplayPlan = {
      mappingTraceId: "trace-replayed",
      approvedSuggestionIds: ["suggestion-approved"],
      contractId: "job-posting-v1",
      mappingVersionId: "mapping-v2",
      targetRecordType: "job_posting",
      idempotencyKey: "trace-replayed:mapping-v2",
      replayStatus: "replayed",
      deterministicValidation: {
        isValid: true,
        validatedAt: "2026-04-24T00:15:00.000Z",
        errors: [],
      },
      scheduledAt: "2026-04-24T00:12:00.000Z",
      replayedAt: "2026-04-24T00:15:00.000Z",
    };

    expect(roundTrip(replayPlan)).toEqual(replayPlan);
  });

  it("keeps the review payload shape domain-oriented", () => {
    const batch: MappingSuggestionBatch = {
      mappingTraceId: "trace-shape",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      sourceSystem: "greenhouse",
      promptVersion: "payload-mapping-v1",
      generatedAt: "2026-04-24T00:20:00.000Z",
      overallConfidence: 0.66,
      driftCategories: ["nested_shape_change"],
      missingRequiredFields: [],
      ambiguousTargetFields: ["employmentType"],
      summary: "Operator review recommended.",
      suggestions: [],
    };

    expect(Object.keys(batch).sort()).toEqual([
      "ambiguousTargetFields",
      "contractId",
      "contractVersion",
      "driftCategories",
      "generatedAt",
      "mappingTraceId",
      "missingRequiredFields",
      "overallConfidence",
      "promptVersion",
      "sourceSystem",
      "suggestions",
      "summary",
    ]);
  });

  it("serializes a review attempt and approved mapping revision", () => {
    const suggestionBatch: MappingSuggestionBatch = {
      mappingTraceId: "trace-1",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      sourceSystem: "ashby",
      promptVersion: "payload-mapping-v1",
      generatedAt: "2026-04-24T00:20:00.000Z",
      overallConfidence: 0.82,
      driftCategories: ["renamed_field"],
      missingRequiredFields: [],
      ambiguousTargetFields: [],
      summary: "Ready for deterministic replay.",
      suggestions: [
        {
          id: "suggestion-pending",
          sourcePath: "/title",
          targetField: "name",
          transformKind: "copy",
          confidence: 0.82,
          explanation: "The source field is a direct semantic match.",
          evidenceSample: "Product Designer",
          deterministicValidation: {
            isValid: true,
            validatedAt: "2026-04-24T00:20:00.000Z",
            errors: [],
          },
          reviewStatus: "approved",
          replayStatus: "pending",
        },
      ],
    };

    const attempt: IntakeAttemptRecord = {
      intakeAttemptId: "attempt-1",
      mappingTraceId: "trace-1",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      mappingVersionId: "mapping-v1",
      sourceSystem: "ashby",
      sourceKind: "fixture_reference",
      sourceFixtureId: "ashby-job-001",
      sourceHash: "sha256:test",
      reviewPayloadExpiresAt: "2026-04-25T00:00:00.000Z",
      deliveryTarget: { queueId: "queue-1" },
      status: "approved",
      ingestStatus: "ingested",
      driftCategory: "renamed_field",
      modelName: "@cf/meta/llama-3.1-8b-instruct",
      promptVersion: "payload-mapping-v1",
      overallConfidence: 0.82,
      redactedSummary: "Ready for deterministic replay.",
      validationErrors: [],
      suggestionBatch,
      createdAt: "2026-04-24T00:20:00.000Z",
      updatedAt: "2026-04-24T00:25:00.000Z",
      approvedAt: "2026-04-24T00:25:00.000Z",
    };
    const revision: ApprovedMappingRevision = {
      mappingVersionId: "mapping-v1",
      intakeAttemptId: "attempt-1",
      mappingTraceId: "trace-1",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      targetRecordType: "job_posting",
      approvedSuggestionIds: ["suggestion-pending"],
      sourceHash: "sha256:test",
      sourceKind: "fixture_reference",
      sourceFixtureId: "ashby-job-001",
      deliveryTarget: { queueId: "queue-1" },
      createdAt: "2026-04-24T00:25:00.000Z",
    };

    expect(roundTrip(attempt)).toEqual(attempt);
    expect(roundTrip(revision)).toEqual(revision);
  });

  it("serializes a generic normalized record envelope", () => {
    const envelope = brandNormalizedEnvelope({
      eventType: "ingest.record.normalized",
      recordType: "job_posting",
      schemaVersion: "v1",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      mappingVersionId: "mapping-v1",
      intakeAttemptId: "attempt-1",
      mappingTraceId: "trace-1",
      source: {
        kind: "fixture_reference",
        fixtureId: "ashby-job-001",
        sourceHash: "sha256:test",
        sourceSystem: "ashby",
        sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
        capturedAt: "2026-04-24T00:25:00.000Z",
      },
      record: {
        name: "Product Designer",
        post_url: "https://jobs.ashbyhq.com/example-co/def456",
      },
    });

    const serialized = JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>;
    expect(serialized).toEqual({
      eventType: "ingest.record.normalized",
      recordType: "job_posting",
      schemaVersion: "v1",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      mappingVersionId: "mapping-v1",
      intakeAttemptId: "attempt-1",
      mappingTraceId: "trace-1",
      source: {
        kind: "fixture_reference",
        fixtureId: "ashby-job-001",
        sourceHash: "sha256:test",
        sourceSystem: "ashby",
        sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
        capturedAt: "2026-04-24T00:25:00.000Z",
      },
      record: {
        name: "Product Designer",
        post_url: "https://jobs.ashbyhq.com/example-co/def456",
      },
    });
  });
});
