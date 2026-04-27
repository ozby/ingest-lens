import { describe, expect, it } from "vitest";
import { getE2EBaseUrlOrThrow } from "../src/journeys/env";
import { getJson, postJson } from "../src/journeys/http";
import type { ApiError, ApiSuccess, AuthResponse } from "../src/journeys/types";

const baseUrl = getE2EBaseUrlOrThrow("apps/e2e/journeys/public-fixture-demo-flow.e2e.ts");

type QueueRecord = {
  id: string;
  name: string;
  ownerId: string;
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

type IntakeAttemptRecord = {
  intakeAttemptId: string;
  mappingTraceId: string;
  contractId: string;
  sourceSystem: string;
  sourceKind: "inline_payload" | "fixture_reference";
  sourceFixtureId?: string;
  status: string;
  ingestStatus: string;
};

type ApprovedMappingRevision = {
  mappingVersionId: string;
  intakeAttemptId: string;
  sourceFixtureId?: string;
};

type NormalizedRecordEnvelope = {
  eventType: "ingest.record.normalized";
  recordType: string;
  intakeAttemptId: string;
  mappingVersionId: string;
  source: {
    kind: "inline_payload" | "fixture_reference";
    fixtureId?: string;
    sourceSystem: string;
  };
  record: Record<string, unknown>;
};

type MessageRecord = {
  id: string;
  queueId: string;
  received: boolean;
  receivedCount: number;
  data: NormalizedRecordEnvelope;
};

describe("public fixture demo flow", () => {
  it("lists the public fixture catalog and replays a pinned fixture through approval into the delivery rails", async () => {
    const runId = crypto.randomUUID().slice(0, 8);
    const credentials = {
      username: `demo-user-${runId}`,
      email: `demo-user-${runId}@example.test`,
      password: `Pass-${runId}`,
    };

    const registration = await postJson<AuthResponse>(baseUrl, "/api/auth/register", credentials);
    expect(registration.response.status).toBe(201);
    const token = registration.body.data.token;

    const unauthorizedFixtures = await getJson<ApiError>(baseUrl, "/api/intake/public-fixtures");
    expect(unauthorizedFixtures.response.status).toBe(401);
    expect(unauthorizedFixtures.body).toMatchObject({
      status: "error",
      message: "Authentication required",
    });

    const queue = await postJson<ApiSuccess<{ queue: QueueRecord }>>(
      baseUrl,
      "/api/queues",
      { name: `demo-${runId}` },
      token,
    );
    expect(queue.response.status).toBe(201);

    const fixtures = await getJson<ApiSuccess<{ fixtures: PublicFixtureMetadata[] }>>(
      baseUrl,
      "/api/intake/public-fixtures",
      token,
    );
    expect(fixtures.response.status).toBe(200);
    expect(fixtures.body.data.fixtures.length).toBeGreaterThan(0);
    expect(fixtures.body.data.fixtures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ashby-job-001",
          sourceSystem: "ashby",
          contractHint: "job-posting-v1",
        }),
        expect.objectContaining({
          id: "lever-posting-001",
          sourceSystem: "lever",
          contractHint: "job-posting-v1",
        }),
      ]),
    );

    const leverFixture = await getJson<ApiSuccess<{ fixture: PublicFixtureDetail }>>(
      baseUrl,
      "/api/intake/public-fixtures/lever-posting-001",
      token,
    );
    expect(leverFixture.response.status).toBe(200);
    expect(leverFixture.body.data.fixture).toMatchObject({
      id: "lever-posting-001",
      sourceSystem: "lever",
      contractHint: "job-posting-v1",
      summary: expect.any(String),
      payload: {
        text: "Senior Frontend Engineer",
        applyUrl: expect.stringContaining("lever.co"),
      },
    });

    const createdAttempt = await postJson<ApiSuccess<{ attempt: IntakeAttemptRecord }>>(
      baseUrl,
      "/api/intake/mapping-suggestions",
      {
        sourceSystem: leverFixture.body.data.fixture.sourceSystem,
        contractId: leverFixture.body.data.fixture.contractHint ?? "job-posting-v1",
        fixtureId: leverFixture.body.data.fixture.id,
        queueId: queue.body.data.queue.id,
      },
      token,
    );
    expect(createdAttempt.response.status).toBe(201);
    expect(createdAttempt.body.data.attempt).toMatchObject({
      sourceSystem: "lever",
      sourceKind: "fixture_reference",
      sourceFixtureId: "lever-posting-001",
      status: "pending_review",
      ingestStatus: "not_started",
    });

    const approval = await postJson<
      ApiSuccess<{
        attempt: IntakeAttemptRecord;
        mappingVersion: ApprovedMappingRevision;
        normalizedRecord: NormalizedRecordEnvelope;
      }>
    >(
      baseUrl,
      `/api/intake/mapping-suggestions/${createdAttempt.body.data.attempt.intakeAttemptId}/approve`,
      {},
      token,
    );
    expect(approval.response.status).toBe(200);
    expect(approval.body.data.attempt).toMatchObject({
      intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
      status: "ingested",
      ingestStatus: "ingested",
      sourceFixtureId: "lever-posting-001",
    });
    expect(approval.body.data.mappingVersion).toMatchObject({
      intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
      sourceFixtureId: "lever-posting-001",
    });
    expect(approval.body.data.normalizedRecord).toMatchObject({
      eventType: "ingest.record.normalized",
      recordType: "job_posting",
      intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
      mappingVersionId: approval.body.data.mappingVersion.mappingVersionId,
      source: {
        kind: "fixture_reference",
        fixtureId: "lever-posting-001",
        sourceSystem: "lever",
      },
      record: {
        name: "Senior Frontend Engineer",
        post_url: expect.stringContaining("lever.co"),
      },
    });

    const queueMessages = await getJson<
      ApiSuccess<{ messages: MessageRecord[]; visibilityTimeout: number }>
    >(baseUrl, `/api/messages/${queue.body.data.queue.id}`, token);
    expect(queueMessages.response.status).toBe(200);
    expect(queueMessages.body.results).toBe(1);
    expect(queueMessages.body.data.messages[0]).toMatchObject({
      queueId: queue.body.data.queue.id,
      received: true,
      receivedCount: 1,
      data: {
        eventType: "ingest.record.normalized",
        intakeAttemptId: createdAttempt.body.data.attempt.intakeAttemptId,
        mappingVersionId: approval.body.data.mappingVersion.mappingVersionId,
        source: {
          kind: "fixture_reference",
          fixtureId: "lever-posting-001",
          sourceSystem: "lever",
        },
        record: {
          name: "Senior Frontend Engineer",
          post_url: expect.stringContaining("lever.co"),
        },
      },
    });
  });
});
