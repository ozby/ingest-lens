import { describe, expect, it } from "vitest";
import type {
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
});
