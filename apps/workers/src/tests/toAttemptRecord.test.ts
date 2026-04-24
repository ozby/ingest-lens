import { describe, expect, it } from "vitest";
import type { intakeAttempts } from "../db/schema";
import { toAttemptRecord } from "../routes/intake";

type AttemptRow = typeof intakeAttempts.$inferSelect;

function createRow(overrides: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id: "attempt-1",
    ownerId: "user-123",
    mappingTraceId: "trace-1",
    contractId: "job-posting-v1",
    contractVersion: "v1",
    mappingVersionId: null,
    sourceSystem: "ashby",
    sourceKind: "fixture_reference",
    sourceFixtureId: "ashby-job-001",
    sourceHash: "sha256:payload",
    deliveryTarget: { queueId: "queue-1" },
    status: "pending_review",
    ingestStatus: "not_started",
    driftCategory: "renamed_field",
    modelName: "test-model",
    promptVersion: "payload-mapping-v1",
    overallConfidence: 0.92,
    redactedSummary: "summary",
    validationErrors: [],
    suggestionBatch: null,
    reviewPayload: null,
    reviewPayloadExpiresAt: null,
    rejectionReason: null,
    ingestError: null,
    approvedAt: null,
    createdAt: new Date("2026-04-24T00:00:00.000Z"),
    updatedAt: new Date("2026-04-24T00:00:00.000Z"),
    ...overrides,
  };
}

describe("toAttemptRecord", () => {
  it("returns the base variant (no mappingVersionId/approvedAt) for pending_review rows", () => {
    const record = toAttemptRecord(createRow({ status: "pending_review" }));

    expect(record.status).toBe("pending_review");
    expect(record.mappingVersionId).toBeUndefined();
    expect(record.approvedAt).toBeUndefined();
  });

  it("returns the approved variant with mappingVersionId and approvedAt for approved rows", () => {
    const approvedAt = new Date("2026-04-24T01:00:00.000Z");
    const record = toAttemptRecord(
      createRow({
        status: "approved",
        mappingVersionId: "mapping-v1",
        approvedAt,
      }),
    );

    expect(record.status).toBe("approved");
    if (
      record.status !== "approved" &&
      record.status !== "ingested" &&
      record.status !== "ingest_failed"
    ) {
      throw new Error("narrowing failed");
    }
    expect(record.mappingVersionId).toBe("mapping-v1");
    expect(record.approvedAt).toBe(approvedAt.toISOString());
  });

  it("throws descriptively when an approved row is missing mappingVersionId", () => {
    const row = createRow({
      status: "approved",
      mappingVersionId: null,
      approvedAt: new Date("2026-04-24T01:00:00.000Z"),
    });

    expect(() => toAttemptRecord(row)).toThrow(
      /approved-family row is missing mappingVersionId or approvedAt/,
    );
  });

  it("throws descriptively when an approved row is missing approvedAt", () => {
    const row = createRow({
      status: "approved",
      mappingVersionId: "mapping-v1",
      approvedAt: null,
    });

    expect(() => toAttemptRecord(row)).toThrow(
      /approved-family row is missing mappingVersionId or approvedAt/,
    );
  });

  it("returns the approved variant for ingested rows", () => {
    const approvedAt = new Date("2026-04-24T02:00:00.000Z");
    const record = toAttemptRecord(
      createRow({
        status: "ingested",
        ingestStatus: "ingested",
        mappingVersionId: "mapping-v2",
        approvedAt,
      }),
    );

    expect(record.status).toBe("ingested");
    if (
      record.status !== "approved" &&
      record.status !== "ingested" &&
      record.status !== "ingest_failed"
    ) {
      throw new Error("narrowing failed");
    }
    expect(record.mappingVersionId).toBe("mapping-v2");
    expect(record.approvedAt).toBe(approvedAt.toISOString());
  });

  it("preserves rejectionReason on rejected rows without including mappingVersionId/approvedAt", () => {
    const record = toAttemptRecord(
      createRow({
        status: "rejected",
        rejectionReason: "Fields did not match the contract.",
      }),
    );

    expect(record.status).toBe("rejected");
    expect(record.rejectionReason).toBe("Fields did not match the contract.");
    expect(record.mappingVersionId).toBeUndefined();
    expect(record.approvedAt).toBeUndefined();
  });
});
