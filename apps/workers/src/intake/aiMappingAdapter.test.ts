import { describe, expect, it } from "vitest";
import type { JudgeAssessment, MappingSuggestionBatch } from "@repo/types";
import {
  DEFAULT_PRIMARY_MODEL,
  suggestMappings,
  type StructuredRunner,
} from "./aiMappingAdapter";

function createValidBatch(): MappingSuggestionBatch {
  return {
    mappingTraceId: "trace-1",
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
        id: "suggestion-1",
        sourcePath: "/company/name",
        targetField: "companyName",
        transformKind: "copy",
        confidence: 0.82,
        explanation: "Direct semantic match.",
        evidenceSample: "IngestLens",
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

function createInput() {
  return {
    payload: {
      company: { name: "IngestLens" },
      location: { city: "Berlin" },
    },
    sourceSystem: "ashby",
    contractId: "job-posting-v1",
    contractVersion: "v1",
    promptVersion: "payload-mapping-v1",
    targetFields: ["companyName", "locationCity"],
  } as const;
}

describe("suggestMappings", () => {
  it("returns success for a validated fake provider result", async () => {
    const fakeRunner: StructuredRunner = async () => createValidBatch();

    await expect(
      suggestMappings(createInput(), {
        primaryRunner: fakeRunner,
      }),
    ).resolves.toEqual({
      kind: "success",
      batch: createValidBatch(),
      decisionLog: {
        provider: "test-runner",
        model: DEFAULT_PRIMARY_MODEL,
        promptVersion: "payload-mapping-v1",
        validationOutcome: "passed",
        confidence: {
          average: 0.82,
          maximum: 0.82,
          minimum: 0.82,
          overall: 0.82,
        },
        judgeDisagreements: 0,
        judgeUnavailableCount: 0,
      },
    });
  });

  it("returns invalid_output for malformed structured output", async () => {
    const malformedBatch = {
      ...createValidBatch(),
      suggestions: [
        {
          ...createValidBatch().suggestions[0],
          explanation: "",
        },
      ],
    };

    const fakeRunner: StructuredRunner = async () =>
      malformedBatch as unknown as MappingSuggestionBatch;

    await expect(
      suggestMappings(createInput(), {
        primaryRunner: fakeRunner,
      }),
    ).resolves.toEqual({
      kind: "invalid_output",
      reason: "Deterministic validation rejected the model output.",
      errors: ["/suggestions/0/explanation must NOT have fewer than 1 characters"],
      decisionLog: {
        provider: "test-runner",
        model: DEFAULT_PRIMARY_MODEL,
        promptVersion: "payload-mapping-v1",
        validationOutcome: "invalid_output",
        confidence: {
          average: 0.82,
          maximum: 0.82,
          minimum: 0.82,
          overall: 0.82,
        },
        failureReason: "deterministic_validation_failed",
        judgeDisagreements: 0,
        judgeUnavailableCount: 0,
      },
    });
  });

  it("rejects syntactically valid source paths that are outside the payload", async () => {
    const fakeRunner: StructuredRunner = async () => ({
      ...createValidBatch(),
      suggestions: [
        {
          ...createValidBatch().suggestions[0],
          sourcePath: "/company/missing",
        },
      ],
    });

    await expect(
      suggestMappings(createInput(), {
        primaryRunner: fakeRunner,
      }),
    ).resolves.toEqual({
      kind: "invalid_output",
      reason: "Deterministic validation rejected the model output.",
      errors: [
        "/suggestions/0/sourcePath Segment 'missing' is outside the current payload.",
      ],
      decisionLog: {
        provider: "test-runner",
        model: DEFAULT_PRIMARY_MODEL,
        promptVersion: "payload-mapping-v1",
        validationOutcome: "invalid_output",
        confidence: {
          average: 0.82,
          maximum: 0.82,
          minimum: 0.82,
          overall: 0.82,
        },
        failureReason: "deterministic_validation_failed",
        judgeDisagreements: 0,
        judgeUnavailableCount: 0,
      },
    });
  });

  it("returns runtime_failure when the primary model exceeds the timeout budget", async () => {
    const fakeRunner: StructuredRunner = async () => {
      return await new Promise<MappingSuggestionBatch>(() => {});
    };

    await expect(
      suggestMappings(createInput(), {
        primaryRunner: fakeRunner,
        timeoutMs: 5,
        primaryMaxAttempts: 1,
      }),
    ).resolves.toEqual({
      kind: "runtime_failure",
      reason: "Primary model attempt 1 timed out after 5ms",
      decisionLog: {
        provider: "test-runner",
        model: DEFAULT_PRIMARY_MODEL,
        promptVersion: "payload-mapping-v1",
        validationOutcome: "runtime_failure",
        confidence: {
          average: 0,
          maximum: 0,
          minimum: 0,
          overall: 0,
        },
        failureReason: "primary_model_timeout",
        judgeDisagreements: 0,
        judgeUnavailableCount: 0,
      },
    });
  });

  it("retries a timed-out attempt after aborting the in-flight request", async () => {
    let attempts = 0;
    let abortedAttempts = 0;

    const fakeRunner: StructuredRunner = async ({ abortSignal }) => {
      attempts += 1;

      if (attempts === 1) {
        return await new Promise<MappingSuggestionBatch>((_resolve, reject) => {
          abortSignal?.addEventListener(
            "abort",
            () => {
              abortedAttempts += 1;
              reject(abortSignal.reason);
            },
            { once: true },
          );
        });
      }

      return createValidBatch();
    };

    const result = await suggestMappings(createInput(), {
      primaryRunner: fakeRunner,
      timeoutMs: 5,
      primaryMaxAttempts: 2,
      retryDelayMs: 0,
    });

    expect(result.kind).toBe("success");
    expect(attempts).toBe(2);
    expect(abortedAttempts).toBe(1);
  });

  it("retries transient primary-model failures before succeeding", async () => {
    let attempts = 0;
    const fakeRunner: StructuredRunner = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary upstream failure");
      }

      return createValidBatch();
    };

    const result = await suggestMappings(createInput(), {
      primaryRunner: fakeRunner,
      primaryMaxAttempts: 2,
      retryDelayMs: 0,
    });

    expect(result.kind).toBe("success");
    expect(attempts).toBe(2);
  });

  it("does not retry non-retryable primary-model failures", async () => {
    let attempts = 0;
    const fakeRunner: StructuredRunner = async () => {
      attempts += 1;
      throw new Error("unsupported provider configuration");
    };

    await expect(
      suggestMappings(createInput(), {
        primaryRunner: fakeRunner,
        primaryMaxAttempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toEqual({
      kind: "runtime_failure",
      reason: "unsupported provider configuration",
      decisionLog: {
        provider: "test-runner",
        model: DEFAULT_PRIMARY_MODEL,
        promptVersion: "payload-mapping-v1",
        validationOutcome: "runtime_failure",
        confidence: {
          average: 0,
          maximum: 0,
          minimum: 0,
          overall: 0,
        },
        failureReason: "primary_model_failed",
        judgeDisagreements: 0,
        judgeUnavailableCount: 0,
      },
    });
    expect(attempts).toBe(1);
  });

  it("abstains on low-confidence output", async () => {
    const fakeRunner: StructuredRunner = async () => ({
      ...createValidBatch(),
      overallConfidence: 0.4,
      suggestions: [
        {
          ...createValidBatch().suggestions[0],
          confidence: 0.4,
        },
      ],
    });

    await expect(
      suggestMappings(createInput(), {
        primaryRunner: fakeRunner,
      }),
    ).resolves.toEqual({
      kind: "abstain",
      reason: "Model confidence is too low for review creation.",
      decisionLog: {
        provider: "test-runner",
        model: DEFAULT_PRIMARY_MODEL,
        promptVersion: "payload-mapping-v1",
        validationOutcome: "abstained",
        confidence: {
          average: 0.4,
          maximum: 0.4,
          minimum: 0.4,
          overall: 0.4,
        },
        failureReason: "low_confidence",
        judgeDisagreements: 0,
        judgeUnavailableCount: 0,
      },
    });
  });

  it("attaches advisory judge output without changing deterministic success", async () => {
    const fakeRunner: StructuredRunner = async () => createValidBatch();
    const judgeRunner: StructuredRunner = async () =>
      ({
        verdict: "warn",
        concerns: ["Review the location mapping before replay."],
        confidence: 0.44,
        recommendedAction: "review",
        explanation: "The suggestion is plausible but deserves a human check.",
      }) satisfies JudgeAssessment;

    const result = await suggestMappings(
      {
        ...createInput(),
        enableJudge: true,
      },
      {
        primaryRunner: fakeRunner,
        judgeRunner,
      },
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      return;
    }

    expect(result.batch.suggestions[0]?.judgeAssessment).toEqual({
      verdict: "warn",
      concerns: ["Review the location mapping before replay."],
      confidence: 0.44,
      recommendedAction: "review",
      explanation: "The suggestion is plausible but deserves a human check.",
    });
    expect(result.decisionLog.judgeDisagreements).toBe(1);
    expect(result.decisionLog.judgeUnavailableCount).toBe(0);
  });

  it("gracefully ignores invalid judge output", async () => {
    const fakeRunner: StructuredRunner = async () => createValidBatch();
    const judgeRunner: StructuredRunner = async () =>
      ({
        verdict: "warn",
        concerns: [],
        confidence: 2,
        recommendedAction: "review",
        explanation: "",
      }) as unknown as JudgeAssessment;

    const result = await suggestMappings(
      {
        ...createInput(),
        enableJudge: true,
      },
      {
        primaryRunner: fakeRunner,
        judgeRunner,
      },
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      return;
    }

    expect(result.batch.suggestions[0]?.judgeAssessment).toBeUndefined();
    expect(result.decisionLog.judgeDisagreements).toBe(0);
    expect(result.decisionLog.judgeUnavailableCount).toBe(1);
  });
});
