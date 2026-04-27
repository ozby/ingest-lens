import { describe, expect, it } from "vitest";
import { getE2EBaseUrlOrThrow } from "../src/journeys/env";
import { deleteJson, getJson, postJson } from "../src/journeys/http";
import type { ApiError, ApiSuccess, AuthResponse } from "../src/journeys/types";

const baseUrl = getE2EBaseUrlOrThrow("apps/e2e/journeys/intake-mapping-flow.e2e.ts");

type QueueRecord = {
  id: string;
  name: string;
  ownerId: string;
  retentionPeriod: number;
};

type PublicFixtureMetadata = {
  id: string;
  sourceSystem: string;
  sourceUrl: string;
  summary: string;
  contractHint?: string;
};

type PublicFixtureDetail = PublicFixtureMetadata & {
  payload: Record<string, unknown>;
};

type MappingSuggestion = {
  id: string;
  sourcePath: string;
  targetField: string;
};

type IntakeAttemptRecord = {
  intakeAttemptId: string;
  mappingTraceId: string;
  contractId: string;
  contractVersion: string;
  mappingVersionId?: string;
  sourceSystem: string;
  sourceKind: "inline_payload" | "fixture_reference";
  sourceFixtureId?: string;
  sourceHash: string;
  deliveryTarget: { queueId?: string; topicId?: string };
  status:
    | "pending_review"
    | "abstained"
    | "invalid_output"
    | "runtime_failure"
    | "approved"
    | "rejected"
    | "ingested"
    | "ingest_failed";
  ingestStatus: "not_started" | "pending" | "ingested" | "failed";
  overallConfidence: number;
  suggestionBatch?: {
    suggestions: MappingSuggestion[];
  };
  createdAt: string;
};

type ApprovedMappingRevision = {
  mappingVersionId: string;
  intakeAttemptId: string;
  contractId: string;
  contractVersion: string;
  sourceKind: "inline_payload" | "fixture_reference";
  sourceFixtureId?: string;
  approvedSuggestionIds: string[];
};

type NormalizedRecordEnvelope = {
  eventType: "ingest.record.normalized";
  recordType: string;
  contractId: string;
  contractVersion: string;
  mappingVersionId: string;
  intakeAttemptId: string;
  mappingTraceId: string;
  source: {
    kind: "inline_payload" | "fixture_reference";
    fixtureId?: string;
    sourceHash: string;
    sourceSystem: string;
    capturedAt: string;
  };
  record: Record<string, unknown>;
};

type MessageRecord = {
  id: string;
  seq: string;
  queueId: string;
  data: NormalizedRecordEnvelope;
  received: boolean;
  receivedCount: number;
};

type DeleteMessageResponse = {
  deletedMessageId: string;
};

describe("intake mapping flow", () => {
  it("creates a deterministic mapping suggestion, approves it, and delivers a normalized record to the queue", async () => {
    const runId = crypto.randomUUID().slice(0, 8);
    const credentials = {
      username: `intake-user-${runId}`,
      email: `intake-user-${runId}@example.test`,
      password: `Pass-${runId}`,
    };

    const registration = await postJson<AuthResponse>(baseUrl, "/api/auth/register", credentials);
    expect(registration.response.status).toBe(201);
    expect(registration.body.status).toBe("success");
    const token = registration.body.data.token;

    const queue = await postJson<ApiSuccess<{ queue: QueueRecord }>>(
      baseUrl,
      "/api/queues",
      {
        name: `intake-${runId}`,
        retentionPeriod: 7,
      },
      token,
    );
    expect(queue.response.status).toBe(201);
    expect(queue.body.data.queue).toMatchObject({
      name: `intake-${runId}`,
      ownerId: registration.body.data.user.id,
      retentionPeriod: 7,
    });

    const unauthorizedAttempt = await postJson<ApiError>(
      baseUrl,
      "/api/intake/mapping-suggestions",
      {
        sourceSystem: "ashby",
        contractId: "job-posting-v1",
        fixtureId: "ashby-job-001",
        queueId: queue.body.data.queue.id,
      },
    );
    expect(unauthorizedAttempt.response.status).toBe(401);
    expect(unauthorizedAttempt.body).toMatchObject({
      status: "error",
      message: "Authentication required",
    });

    const fixtureCatalog = await getJson<ApiSuccess<{ fixtures: PublicFixtureMetadata[] }>>(
      baseUrl,
      "/api/intake/public-fixtures",
      token,
    );
    expect(fixtureCatalog.response.status).toBe(200);
    expect(fixtureCatalog.body.data.fixtures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ashby-job-001",
          sourceSystem: "ashby",
          contractHint: "job-posting-v1",
        }),
        expect.objectContaining({
          sourceSystem: "greenhouse",
        }),
        expect.objectContaining({
          sourceSystem: "lever",
        }),
      ]),
    );
    expect(fixtureCatalog.body.data.fixtures.every((fixture) => !("payload" in fixture))).toBe(
      true,
    );

    const ashbyFixture = await getJson<ApiSuccess<{ fixture: PublicFixtureDetail }>>(
      baseUrl,
      "/api/intake/public-fixtures/ashby-job-001",
      token,
    );
    expect(ashbyFixture.response.status).toBe(200);
    expect(ashbyFixture.body.data.fixture).toMatchObject({
      id: "ashby-job-001",
      sourceSystem: "ashby",
      contractHint: "job-posting-v1",
      payload: {
        title: expect.any(String),
      },
    });

    const missingFixture = await getJson<ApiError>(
      baseUrl,
      "/api/intake/public-fixtures/missing-fixture",
      token,
    );
    expect(missingFixture.response.status).toBe(404);
    expect(missingFixture.body).toMatchObject({
      status: "error",
      message: "Fixture not found",
    });

    const createdAttempt = await postJson<ApiSuccess<{ attempt: IntakeAttemptRecord }>>(
      baseUrl,
      "/api/intake/mapping-suggestions",
      {
        sourceSystem: "ashby",
        contractId: "job-posting-v1",
        fixtureId: "ashby-job-001",
        queueId: queue.body.data.queue.id,
      },
      token,
    );
    expect(createdAttempt.response.status).toBe(201);
    expect(createdAttempt.body.data.attempt).toMatchObject({
      contractId: "job-posting-v1",
      sourceSystem: "ashby",
      sourceKind: "fixture_reference",
      sourceFixtureId: "ashby-job-001",
      status: "pending_review",
      ingestStatus: "not_started",
      deliveryTarget: { queueId: queue.body.data.queue.id },
    });
    expect(createdAttempt.body.data.attempt.suggestionBatch?.suggestions.length).toBeGreaterThan(0);

    const listedAttempts = await getJson<ApiSuccess<{ attempts: IntakeAttemptRecord[] }>>(
      baseUrl,
      "/api/intake/mapping-suggestions?status=pending_review",
      token,
    );
    expect(listedAttempts.response.status).toBe(200);
    expect(listedAttempts.body.results).toBe(1);
    expect(listedAttempts.body.data.attempts[0]).toMatchObject({
      intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
      mappingTraceId: createdAttempt.body.data.attempt.mappingTraceId,
      sourceFixtureId: "ashby-job-001",
      status: "pending_review",
    });

    const approvedSuggestionIds = (
      createdAttempt.body.data.attempt.suggestionBatch?.suggestions ?? []
    ).map((suggestion) => suggestion.id);
    expect(approvedSuggestionIds.length).toBeGreaterThan(0);

    const approval = await postJson<
      ApiSuccess<{
        attempt: IntakeAttemptRecord;
        mappingVersion: ApprovedMappingRevision;
        normalizedRecord: NormalizedRecordEnvelope;
      }>
    >(
      baseUrl,
      `/api/intake/mapping-suggestions/${createdAttempt.body.data.attempt.intakeAttemptId}/approve`,
      { approvedSuggestionIds },
      token,
    );
    expect(approval.response.status).toBe(200);
    expect(approval.body.data.attempt).toMatchObject({
      intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
      status: "ingested",
      ingestStatus: "ingested",
      sourceFixtureId: "ashby-job-001",
    });
    expect(approval.body.data.mappingVersion).toMatchObject({
      intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
      contractId: "job-posting-v1",
      sourceKind: "fixture_reference",
      sourceFixtureId: "ashby-job-001",
      approvedSuggestionIds,
    });
    expect(approval.body.data.normalizedRecord).toMatchObject({
      eventType: "ingest.record.normalized",
      recordType: "job_posting",
      contractId: "job-posting-v1",
      intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
      mappingVersionId: approval.body.data.mappingVersion.mappingVersionId,
      mappingTraceId: createdAttempt.body.data.attempt.mappingTraceId,
      source: {
        kind: "fixture_reference",
        fixtureId: "ashby-job-001",
        sourceSystem: "ashby",
      },
    });
    expect(approval.body.data.normalizedRecord.record).toMatchObject({
      name: expect.any(String),
      post_url: expect.stringContaining("ashbyhq.com"),
    });

    const queueMessages = await getJson<
      ApiSuccess<{ messages: MessageRecord[]; visibilityTimeout: number }>
    >(baseUrl, `/api/messages/${queue.body.data.queue.id}`, token);
    expect(queueMessages.response.status).toBe(200);
    expect(queueMessages.body.results).toBe(1);
    expect(queueMessages.body.data.messages).toHaveLength(1);
    expect(queueMessages.body.data.messages[0]).toMatchObject({
      queueId: queue.body.data.queue.id,
      received: true,
      receivedCount: 1,
      data: {
        eventType: "ingest.record.normalized",
        recordType: "job_posting",
        contractId: "job-posting-v1",
        intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
        mappingVersionId: approval.body.data.mappingVersion.mappingVersionId,
        source: {
          kind: "fixture_reference",
          fixtureId: "ashby-job-001",
          sourceSystem: "ashby",
        },
      },
    });

    const ackedMessage = await deleteJson<ApiSuccess<DeleteMessageResponse>>(
      baseUrl,
      `/api/messages/${queue.body.data.queue.id}/${queueMessages.body.data.messages[0].id}`,
      token,
    );
    expect(ackedMessage.response.status).toBe(200);
    expect(ackedMessage.body).toEqual({
      status: "success",
      data: { deletedMessageId: queueMessages.body.data.messages[0].id },
    });

    const queueAfterAck = await getJson<
      ApiSuccess<{ messages: MessageRecord[]; visibilityTimeout: number }>
    >(baseUrl, `/api/messages/${queue.body.data.queue.id}`, token);
    expect(queueAfterAck.response.status).toBe(200);
    expect(queueAfterAck.body.results).toBe(0);
    expect(queueAfterAck.body.data.messages).toEqual([]);
  });
});
