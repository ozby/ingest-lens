import { describe, expect, it } from "vitest";
import {
  validateJudgeAssessment,
  validateMappingSuggestionBatch,
  validateReplayPlan,
} from "./validators";

function createValidBatch() {
  return {
    mappingTraceId: "trace-1",
    contractId: "job-posting-v1",
    contractVersion: "v1",
    sourceSystem: "ashby",
    promptVersion: "payload-mapping-v1",
    generatedAt: "2026-04-24T00:00:00.000Z",
    overallConfidence: 0.85,
    driftCategories: ["renamed_field"],
    missingRequiredFields: ["applyUrl"],
    ambiguousTargetFields: ["department"],
    summary: "Review required before promotion.",
    suggestions: [
      {
        id: "suggestion-1",
        sourcePath: "/company/name",
        targetField: "companyName",
        transformKind: "copy",
        confidence: 0.8,
        explanation: "Direct source-to-contract match.",
        evidenceSample: "IngestLens",
        deterministicValidation: {
          isValid: true,
          validatedAt: "2026-04-24T00:00:00.000Z",
          errors: [],
        },
        judgeAssessment: {
          verdict: "agree",
          concerns: [],
          confidence: 0.73,
          recommendedAction: "approve",
          explanation: "This suggestion is low-risk.",
        },
        reviewStatus: "pending",
        replayStatus: "not_requested",
      },
    ],
  };
}

describe("intake validators", () => {
  it("accepts a valid mapping suggestion batch", () => {
    const result = validateMappingSuggestionBatch(createValidBatch(), {
      allowedTargetFields: ["companyName", "locationCity"],
    });

    expect(result).toEqual({
      ok: true,
      value: createValidBatch(),
    });
  });

  it("rejects a batch with missing explanations", () => {
    const batch = createValidBatch();
    batch.suggestions[0] = {
      ...batch.suggestions[0],
      explanation: "",
    };

    expect(validateMappingSuggestionBatch(batch)).toEqual({
      ok: false,
      errors: ["/suggestions/0/explanation must NOT have fewer than 1 characters"],
    });
  });

  it("rejects invalid confidence values", () => {
    const batch = createValidBatch();
    batch.suggestions[0] = {
      ...batch.suggestions[0],
      confidence: 1.2,
    };

    expect(validateMappingSuggestionBatch(batch)).toEqual({
      ok: false,
      errors: ["/suggestions/0/confidence must be <= 1"],
    });
  });

  it("rejects unknown target fields when an allowlist is provided", () => {
    const batch = createValidBatch();
    batch.suggestions[0] = {
      ...batch.suggestions[0],
      targetField: "unknownField",
    };

    expect(
      validateMappingSuggestionBatch(batch, {
        allowedTargetFields: ["companyName", "locationCity"],
      }),
    ).toEqual({
      ok: false,
      errors: ["/suggestions/0/targetField must be one of: companyName, locationCity"],
    });
  });

  it("rejects malformed source paths", () => {
    const batch = createValidBatch();
    batch.suggestions[0] = {
      ...batch.suggestions[0],
      sourcePath: "company/name",
    };

    expect(validateMappingSuggestionBatch(batch)).toEqual({
      ok: false,
      errors: ["/suggestions/0/sourcePath Source paths must start with '/'."],
    });
  });

  it("rejects syntactically valid source paths that do not exist in the payload", () => {
    const batch = createValidBatch();
    batch.suggestions[0] = {
      ...batch.suggestions[0],
      sourcePath: "/company/missing",
    };

    expect(
      validateMappingSuggestionBatch(batch, {
        sourcePayload: {
          company: { name: "IngestLens" },
        },
      }),
    ).toEqual({
      ok: false,
      errors: ["/suggestions/0/sourcePath Segment 'missing' is outside the current payload."],
    });
  });

  it("validates judge assessments", () => {
    const result = validateJudgeAssessment({
      verdict: "warn",
      concerns: ["Mapping depends on free-form text."],
      confidence: 0.41,
      recommendedAction: "review",
      explanation: "Operator review is safer than auto-promotion.",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        verdict: "warn",
        concerns: ["Mapping depends on free-form text."],
        confidence: 0.41,
        recommendedAction: "review",
        explanation: "Operator review is safer than auto-promotion.",
      },
    });
  });

  it("rejects invalid replay plans", () => {
    expect(
      validateReplayPlan({
        mappingTraceId: "trace-1",
        approvedSuggestionIds: ["suggestion-1"],
        mappingVersionId: "mapping-v2",
        targetRecordType: "job_posting",
        idempotencyKey: "trace-1:mapping-v2",
        replayStatus: "pending",
        deterministicValidation: {
          isValid: true,
          validatedAt: "2026-04-24T00:00:00.000Z",
          errors: [],
        },
        scheduledAt: "2026-04-24T00:00:00.000Z",
      }),
    ).toEqual({
      ok: false,
      errors: ["/ must have required property 'contractId'"],
    });
  });
});
