import { describe, expect, it } from "vitest";
import { createNormalizedEnvelope } from "../intake/normalizedEnvelope";
import { normalizeWithMapping } from "../intake/normalizeWithMapping";

describe("normalizeWithMapping", () => {
  it("applies approved mappings into a generic normalized envelope", () => {
    const record = normalizeWithMapping({
      payload: {
        title: "  Staff Software Engineer  ",
        apply_url: "https://jobs.example.com/demo",
        details: { department: "Engineering" },
      },
      suggestions: [
        {
          id: "suggestion-1",
          sourcePath: "/title",
          targetField: "name",
          transformKind: "trim",
          confidence: 0.96,
          explanation: "",
          evidenceSample: "",
          deterministicValidation: {
            isValid: true,
            validatedAt: "2026-04-24T00:00:00.000Z",
            errors: [],
          },
          reviewStatus: "approved",
          replayStatus: "replayed",
        },
        {
          id: "suggestion-2",
          sourcePath: "/apply_url",
          targetField: "post_url",
          transformKind: "copy",
          confidence: 0.95,
          explanation: "",
          evidenceSample: "",
          deterministicValidation: {
            isValid: true,
            validatedAt: "2026-04-24T00:00:00.000Z",
            errors: [],
          },
          reviewStatus: "approved",
          replayStatus: "replayed",
        },
        {
          id: "suggestion-3",
          sourcePath: "/details/department",
          targetField: "department",
          transformKind: "copy",
          confidence: 0.95,
          explanation: "",
          evidenceSample: "",
          deterministicValidation: {
            isValid: true,
            validatedAt: "2026-04-24T00:00:00.000Z",
            errors: [],
          },
          reviewStatus: "approved",
          replayStatus: "replayed",
        },
      ],
    });

    const envelope = createNormalizedEnvelope({
      attempt: {
        intakeAttemptId: "attempt-1",
        mappingTraceId: "trace-1",
        contractId: "job-posting-v1",
        contractVersion: "v1",
        mappingVersionId: "mapping-version-1",
        sourceSystem: "ashby",
        sourceKind: "fixture_reference",
        sourceFixtureId: "ashby-job-001",
        sourceHash: "payload_hash",
        deliveryTarget: { queueId: "queue-1" },
        status: "approved",
        ingestStatus: "pending",
        driftCategory: "renamed_field",
        modelName: "test-model",
        promptVersion: "payload-mapper-v1",
        overallConfidence: 0.95,
        redactedSummary: "fields: title, apply_url, details",
        validationErrors: [],
        createdAt: "2026-04-24T00:00:00.000Z",
        updatedAt: "2026-04-24T00:00:00.000Z",
      },
      mappingVersion: {
        mappingVersionId: "mapping-version-1",
        intakeAttemptId: "attempt-1",
        mappingTraceId: "trace-1",
        contractId: "job-posting-v1",
        contractVersion: "v1",
        targetRecordType: "job_posting",
        approvedSuggestionIds: ["suggestion-1", "suggestion-2", "suggestion-3"],
        sourceHash: "payload_hash",
        sourceKind: "fixture_reference",
        sourceFixtureId: "ashby-job-001",
        deliveryTarget: { queueId: "queue-1" },
        createdAt: "2026-04-24T00:00:00.000Z",
      },
      record,
    });

    expect(envelope).toMatchObject({
      eventType: "ingest.record.normalized",
      recordType: "job_posting",
      schemaVersion: "v1",
      record: {
        name: "Staff Software Engineer",
        post_url: "https://jobs.example.com/demo",
        department: "Engineering",
      },
    });
  });

  it("supports nested target fields and array transforms", () => {
    const record = normalizeWithMapping({
      payload: {
        certifications: ["UX", "Accessibility"],
      },
      suggestions: [
        {
          id: "suggestion-1",
          sourcePath: "/certifications",
          targetField: "custom_fields.certifications",
          transformKind: "to_array",
          confidence: 0.95,
          explanation: "",
          evidenceSample: "",
          deterministicValidation: {
            isValid: true,
            validatedAt: "2026-04-24T00:00:00.000Z",
            errors: [],
          },
          reviewStatus: "approved",
          replayStatus: "replayed",
        },
      ],
    });

    expect(record).toEqual({
      custom_fields: {
        certifications: ["UX", "Accessibility"],
      },
    });
  });
});
