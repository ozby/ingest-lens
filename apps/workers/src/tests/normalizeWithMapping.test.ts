import { describe, expect, it } from "vitest";
import { getFixtureReference } from "../intake/contracts";
import { createNormalizedEnvelope, normalizeWithMapping } from "../intake/normalize";

describe("normalizeWithMapping", () => {
  it.each([
    {
      fixtureId: "ashby-job-001",
      sourceSystem: "ashby",
      suggestions: [
        ["suggestion-1", "/title", "name", "trim"],
        ["suggestion-2", "/apply_url", "post_url", "copy"],
        ["suggestion-3", "/department", "department", "copy"],
        ["suggestion-4", "/locations/0", "location", "copy"],
      ] as const,
      expectedRecord: {
        name: "Staff Software Engineer, Backend",
        post_url: "https://jobs.ashbyhq.com/example-co/abc123",
        department: "Engineering",
        location: "Remote",
      },
    },
    {
      fixtureId: "greenhouse-job-001",
      sourceSystem: "greenhouse",
      suggestions: [
        ["suggestion-1", "/name", "name", "copy"],
        ["suggestion-2", "/status", "status", "copy"],
        ["suggestion-3", "/departments/0/name", "department", "copy"],
        ["suggestion-4", "/offices/0/location/name", "location", "copy"],
      ] as const,
      expectedRecord: {
        name: "Senior Data Engineer",
        status: "open",
        department: "Data Platform",
        location: "Austin, TX",
      },
    },
    {
      fixtureId: "lever-posting-001",
      sourceSystem: "lever",
      suggestions: [
        ["suggestion-1", "/text", "name", "copy"],
        ["suggestion-2", "/state", "status", "copy"],
        ["suggestion-3", "/team", "department", "copy"],
        ["suggestion-4", "/location", "location", "copy"],
        ["suggestion-5", "/applyUrl", "post_url", "copy"],
      ] as const,
      expectedRecord: {
        name: "Senior Frontend Engineer",
        status: "published",
        department: "Frontend",
        location: "Remote - Europe",
        post_url: "https://jobs.lever.co/example-co/a1b2c3d4",
      },
    },
  ])(
    "normalizes %s public fixture into the generic envelope after approval",
    ({ fixtureId, sourceSystem, suggestions, expectedRecord }) => {
      const fixture = getFixtureReference(fixtureId);

      if (!fixture) {
        throw new Error(`Fixture ${fixtureId} must exist`);
      }

      const record = normalizeWithMapping({
        payload: fixture.payload,
        suggestions: suggestions.map(([id, sourcePath, targetField, transformKind]) => ({
          id,
          sourcePath,
          targetField,
          transformKind,
          confidence: 0.95,
          explanation: "",
          evidenceSample: "",
          deterministicValidation: {
            isValid: true,
            validatedAt: "2026-04-24T00:00:00.000Z",
            errors: [],
          },
          reviewStatus: "approved" as const,
          replayStatus: "replayed" as const,
        })),
      });

      const envelope = createNormalizedEnvelope({
        attempt: {
          intakeAttemptId: `attempt-${fixtureId}`,
          mappingTraceId: `trace-${fixtureId}`,
          contractId: "job-posting-v1",
          contractVersion: "v1",
          mappingVersionId: `mapping-version-${fixtureId}`,
          sourceSystem,
          sourceKind: "fixture_reference",
          sourceFixtureId: fixtureId,
          sourceHash: `payload-hash-${fixtureId}`,
          deliveryTarget: { queueId: "queue-1" },
          status: "approved",
          ingestStatus: "pending",
          driftCategory: "renamed_field",
          modelName: "test-model",
          promptVersion: "payload-mapper-v1",
          overallConfidence: 0.95,
          redactedSummary: "fixture-backed review",
          validationErrors: [],
          createdAt: "2026-04-24T00:00:00.000Z",
          updatedAt: "2026-04-24T00:00:00.000Z",
          approvedAt: "2026-04-24T00:00:00.000Z",
        },
        mappingVersion: {
          mappingVersionId: `mapping-version-${fixtureId}`,
          intakeAttemptId: `attempt-${fixtureId}`,
          mappingTraceId: `trace-${fixtureId}`,
          contractId: "job-posting-v1",
          contractVersion: "v1",
          targetRecordType: "job_posting",
          approvedSuggestionIds: suggestions.map(([id]) => id),
          sourceHash: `payload-hash-${fixtureId}`,
          sourceKind: "fixture_reference",
          sourceFixtureId: fixtureId,
          deliveryTarget: { queueId: "queue-1" },
          createdAt: "2026-04-24T00:00:00.000Z",
        },
        record,
      });

      expect(envelope).toMatchObject({
        eventType: "ingest.record.normalized",
        recordType: "job_posting",
        schemaVersion: "v1",
        mappingTraceId: `trace-${fixtureId}`,
        source: {
          fixtureId,
          sourceHash: `payload-hash-${fixtureId}`,
          sourceUrl: fixture.sourceUrl,
        },
        record: expectedRecord,
      });
    },
  );

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
