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

type ApprovalResponse = ApiSuccess<{
  attempt: IntakeAttemptRecord;
  mappingVersion: ApprovedMappingRevision;
  normalizedRecord: NormalizedRecordEnvelope;
}>;

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

    const replaySourceSystem = `lever-demo-${runId}`;
    const createdAttempt = await postJson<
      ApiSuccess<{ attempt: IntakeAttemptRecord }> | ApprovalResponse
    >(
      baseUrl,
      "/api/intake/mapping-suggestions",
      {
        sourceSystem: replaySourceSystem,
        contractId: leverFixture.body.data.fixture.contractHint ?? "job-posting-v1",
        payload: leverFixture.body.data.fixture.payload,
        queueId: queue.body.data.queue.id,
      },
      token,
    );
    let approvedAttempt: IntakeAttemptRecord;
    let mappingVersion: ApprovedMappingRevision;
    let normalizedRecord: NormalizedRecordEnvelope;

    if (createdAttempt.response.status === 201) {
      const pendingAttempt = (createdAttempt.body as ApiSuccess<{ attempt: IntakeAttemptRecord }>)
        .data.attempt;
      expect(pendingAttempt).toMatchObject({
        sourceSystem: replaySourceSystem,
        sourceKind: "inline_payload",
        status: "pending_review",
        ingestStatus: "not_started",
      });

      const approval = await postJson<ApprovalResponse>(
        baseUrl,
        `/api/intake/mapping-suggestions/${pendingAttempt.intakeAttemptId}/approve`,
        {},
        token,
      );
      expect(approval.response.status).toBe(200);
      approvedAttempt = approval.body.data.attempt;
      mappingVersion = approval.body.data.mappingVersion;
      normalizedRecord = approval.body.data.normalizedRecord;
    } else {
      expect(createdAttempt.response.status).toBe(200);
      const autoApproved = createdAttempt.body as ApprovalResponse;
      approvedAttempt = autoApproved.data.attempt;
      mappingVersion = autoApproved.data.mappingVersion;
      normalizedRecord = autoApproved.data.normalizedRecord;
    }

    expect(approvedAttempt).toMatchObject({
      status: "ingested",
      ingestStatus: "ingested",
      sourceSystem: replaySourceSystem,
    });
    expect(mappingVersion).toMatchObject({
      intakeAttemptId: approvedAttempt.intakeAttemptId,
      sourceKind: "inline_payload",
    });
    expect(normalizedRecord).toMatchObject({
      eventType: "ingest.record.normalized",
      recordType: "job_posting",
      intakeAttemptId: approvedAttempt.intakeAttemptId,
      mappingVersionId: mappingVersion.mappingVersionId,
      source: {
        kind: "inline_payload",
        sourceSystem: replaySourceSystem,
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
        intakeAttemptId: approvedAttempt.intakeAttemptId,
        mappingVersionId: mappingVersion.mappingVersionId,
        source: {
          kind: "inline_payload",
          sourceSystem: replaySourceSystem,
        },
        record: {
          name: "Senior Frontend Engineer",
          post_url: expect.stringContaining("lever.co"),
        },
      },
    });
  });
});
