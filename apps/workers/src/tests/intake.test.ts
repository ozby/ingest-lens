import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../index";
import { createDb } from "../db/client";
import { approvedMappingRevisions, intakeAttempts, messages, queues, topics } from "../db/schema";
import { authenticate } from "../middleware/auth";
import { AUTH_HEADER, bypassAuth, createMockEnv, createMockHealStream, get, post } from "./helpers";
import { suggestMappings } from "../intake/aiMappingAdapter";
import { shapeFingerprint } from "../intake/shapeFingerprint";

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("../intake/aiMappingAdapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../intake/aiMappingAdapter")>();
  return {
    ...actual,
    suggestMappings: vi.fn(),
  };
});

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

type AttemptRow = typeof intakeAttempts.$inferSelect;
type MappingVersionRow = typeof approvedMappingRevisions.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type QueueRow = typeof queues.$inferSelect;
type TopicRow = typeof topics.$inferSelect;

type FakeDbState = {
  attempts: AttemptRow[];
  mappingVersions: MappingVersionRow[];
  messages: MessageRow[];
  queues: QueueRow[];
  topics: TopicRow[];
};

type FakeDbOverrides = {
  emptyIntakeAttemptInsert?: boolean;
  emptyIntakeAttemptUpdate?: boolean;
  emptyApprovedRevisionInsert?: boolean;
};

function createFakeDb(state: FakeDbState, overrides: FakeDbOverrides = {}) {
  const rowsForTable = (table: unknown) => {
    if (table === intakeAttempts) return state.attempts;
    if (table === approvedMappingRevisions) return state.mappingVersions;
    if (table === messages) return state.messages;
    if (table === queues) return state.queues;
    if (table === topics) return state.topics;
    return [];
  };

  const fake = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => {
          const rows = rowsForTable(table);
          return {
            limit: vi.fn(async () => rows),
            then: (
              onFulfilled: (value: unknown[]) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) => Promise.resolve(rows).then(onFulfilled, onRejected),
          };
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (table !== messages) return [];
            const duplicate = state.messages.find(
              (message) =>
                message.queueId === values.queueId &&
                message.idempotencyKey === (values.idempotencyKey ?? null),
            );
            if (duplicate) {
              return [];
            }

            const message = {
              id: `message-${state.messages.length + 1}`,
              seq: BigInt(state.messages.length + 1),
              createdAt: new Date("2026-04-24T00:00:00.000Z"),
              updatedAt: new Date("2026-04-24T00:00:00.000Z"),
              receivedAt: null,
              visibilityExpiresAt: null,
              ...values,
            } as unknown as MessageRow;
            state.messages = [...state.messages, message];
            return [message];
          }),
        })),
        returning: vi.fn(async () => {
          if (table === intakeAttempts) {
            if (overrides.emptyIntakeAttemptInsert) return [];
            const row = values as unknown as AttemptRow;
            state.attempts = [row, ...state.attempts.filter((attempt) => attempt.id !== row.id)];
            return [row];
          }

          if (table === approvedMappingRevisions) {
            if (overrides.emptyApprovedRevisionInsert) return [];
            const row = values as unknown as MappingVersionRow;
            state.mappingVersions = [
              row,
              ...state.mappingVersions.filter((version) => version.id !== row.id),
            ];
            return [row];
          }

          if (table === messages) {
            const message = {
              id: `message-${state.messages.length + 1}`,
              seq: BigInt(state.messages.length + 1),
              createdAt: new Date("2026-04-24T00:00:00.000Z"),
              updatedAt: new Date("2026-04-24T00:00:00.000Z"),
              receivedAt: null,
              visibilityExpiresAt: null,
              idempotencyKey: null,
              deliveryMode: "pull",
              enqueueState: "not_needed",
              pushDeliveredAt: null,
              lastEnqueueError: null,
              ...values,
            } as unknown as MessageRow;
            state.messages = [...state.messages, message];
            return [message];
          }

          return [values];
        }),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (table === intakeAttempts) {
              if (overrides.emptyIntakeAttemptUpdate) return [];
              if (state.attempts[0]) {
                state.attempts = [
                  {
                    ...state.attempts[0],
                    ...values,
                  } as AttemptRow,
                ];
                return state.attempts;
              }
            }
            if (table === messages && state.messages[0]) {
              state.messages = [
                {
                  ...state.messages[0],
                  ...values,
                } as MessageRow,
                ...state.messages.slice(1),
              ];
              return state.messages;
            }
            return [];
          }),
        })),
      })),
    })),
    transaction: vi.fn(async (cb: (tx: typeof fake) => unknown) => cb(fake)),
  };
  return fake;
}

function createAttemptRow(overrides: Partial<AttemptRow> = {}): AttemptRow {
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
    sourceHash: "payload_abc123",
    deliveryTarget: { queueId: "queue-1" },
    status: "pending_review",
    ingestStatus: "not_started",
    driftCategory: "renamed_field",
    modelName: "test-model",
    promptVersion: "payload-mapper-v1",
    overallConfidence: 0.92,
    redactedSummary:
      "Payload captured with top-level fields: apply_url, department, employment_type, locations, title.",
    validationErrors: [],
    suggestionBatch: {
      mappingTraceId: "trace-1",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      sourceSystem: "ashby",
      promptVersion: "payload-mapper-v1",
      generatedAt: "2026-04-24T00:00:00.000Z",
      overallConfidence: 0.92,
      driftCategories: ["renamed_field"],
      missingRequiredFields: [],
      ambiguousTargetFields: [],
      suggestions: [
        {
          id: "suggestion-1",
          sourcePath: "/title",
          targetField: "name",
          transformKind: "copy",
          confidence: 0.96,
          explanation: "Title is the job name.",
          evidenceSample: "Staff Software Engineer, Backend",
          deterministicValidation: {
            isValid: true,
            validatedAt: "2026-04-24T00:00:00.000Z",
            errors: [],
          },
          reviewStatus: "pending",
          replayStatus: "not_requested",
        },
      ],
      summary: "One safe suggestion.",
    },
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

const deliveryQueue = { send: vi.fn().mockResolvedValue(undefined) };
const testQueue = {
  id: "queue-1",
  name: "Demo queue",
  ownerId: "user-123",
  retentionPeriod: 14,
  schema: null,
  pushEndpoint: "https://example.com/webhook",
  createdAt: new Date("2026-04-24T00:00:00.000Z"),
  updatedAt: new Date("2026-04-24T00:00:00.000Z"),
} satisfies QueueRow;

beforeEach(() => {
  vi.clearAllMocks();
  deliveryQueue.send.mockResolvedValue(undefined);
  vi.mocked(authenticate).mockImplementation(async (c: any) =>
    c.json({ status: "error", message: "Authentication required" }, 401),
  );
});

describe("intake routes", () => {
  it("lists public fixture metadata without payload bodies", async () => {
    bypassAuth(vi.mocked(authenticate));

    const response = await app.fetch(
      get("/api/intake/public-fixtures", AUTH_HEADER),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        fixtures: Array<Record<string, unknown>>;
      };
    };

    expect(payload.data.fixtures).toHaveLength(8);
    expect(payload.data.fixtures[0]).toMatchObject({
      id: "ashby-job-001",
      sourceSystem: "ashby",
      contractHint: "job-posting-v1",
    });
    expect(payload.data.fixtures[0]).not.toHaveProperty("payload");
  });

  it("loads one public fixture payload by id", async () => {
    bypassAuth(vi.mocked(authenticate));

    const response = await app.fetch(
      get("/api/intake/public-fixtures/lever-posting-001", AUTH_HEADER),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        fixture: {
          id: string;
          sourceSystem: string;
          contractHint: string;
          payload: Record<string, unknown>;
        };
      };
    };

    expect(payload.data.fixture).toMatchObject({
      id: "lever-posting-001",
      sourceSystem: "lever",
      contractHint: "job-posting-v1",
      payload: {
        text: "Senior Frontend Engineer",
      },
    });
  });

  it("returns 404 for unknown public fixture ids", async () => {
    bypassAuth(vi.mocked(authenticate));

    const response = await app.fetch(
      get("/api/intake/public-fixtures/missing-fixture", AUTH_HEADER),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const response = await app.fetch(
      post("/api/intake/mapping-suggestions", {
        contractId: "job-posting-v1",
        payload: { title: "Demo" },
        queueId: "queue-1",
        sourceSystem: "manual",
      }),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(401);
  });

  it("returns 429 when the authenticated user is rate limited", async () => {
    bypassAuth(vi.mocked(authenticate));
    vi.mocked(createDb).mockReturnValue(
      createFakeDb({
        attempts: [],
        mappingVersions: [],
        messages: [],
        queues: [],
        topics: [],
      }) as never,
    );

    const response = await app.fetch(
      post(
        "/api/intake/mapping-suggestions",
        {
          contractId: "job-posting-v1",
          fixtureId: "ashby-job-001",
          queueId: "queue-1",
          sourceSystem: "manual",
        },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue, { limit: vi.fn().mockResolvedValue({ success: false }) }),
    );

    expect(response.status).toBe(429);
    expect(vi.mocked(suggestMappings)).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads before AI execution", async () => {
    bypassAuth(vi.mocked(authenticate));
    vi.mocked(createDb).mockReturnValue(
      createFakeDb({
        attempts: [],
        mappingVersions: [],
        messages: [],
        queues: [],
        topics: [],
      }) as never,
    );

    const response = await app.fetch(
      post(
        "/api/intake/mapping-suggestions",
        {
          contractId: "missing-contract",
          payload: { title: "Demo" },
          queueId: "queue-1",
          sourceSystem: "manual",
        },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(400);
    expect(vi.mocked(suggestMappings)).not.toHaveBeenCalled();
  });

  it("creates a pending-review attempt for a valid fixture suggestion", async () => {
    bypassAuth(vi.mocked(authenticate));
    vi.mocked(suggestMappings).mockResolvedValueOnce({
      kind: "success",
      batch: createAttemptRow().suggestionBatch!,
      decisionLog: {
        provider: "test-runner",
        model: "test-model",
        promptVersion: "payload-mapper-v1",
        validationOutcome: "passed",
        confidence: { average: 0.96, maximum: 0.96, minimum: 0.96, overall: 0.92 },
        judgeDisagreements: 0,
        judgeUnavailableCount: 0,
      },
    });
    const state: FakeDbState = {
      attempts: [],
      mappingVersions: [],
      messages: [],
      queues: [],
      topics: [],
    };
    vi.mocked(createDb).mockReturnValue(createFakeDb(state) as never);

    const response = await app.fetch(
      post(
        "/api/intake/mapping-suggestions",
        {
          contractId: "job-posting-v1",
          fixtureId: "ashby-job-001",
          queueId: "queue-1",
          sourceSystem: "manual",
        },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { attempt: { sourceKind: string; status: string } };
    };
    expect(payload.data.attempt.status).toBe("pending_review");
    expect(payload.data.attempt.sourceKind).toBe("fixture_reference");
    expect(state.attempts).toHaveLength(1);
  });

  it("approves once and publishes to the existing delivery queue rails", async () => {
    bypassAuth(vi.mocked(authenticate));
    const attempt = createAttemptRow();
    const state: FakeDbState = {
      attempts: [attempt],
      mappingVersions: [],
      messages: [],
      queues: [testQueue],
      topics: [],
    };
    vi.mocked(createDb).mockReturnValue(createFakeDb(state) as never);

    const firstResponse = await app.fetch(
      post(
        "/api/intake/mapping-suggestions/attempt-1/approve",
        { approvedSuggestionIds: ["suggestion-1"] },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue),
    );

    expect(firstResponse.status).toBe(200);
    const firstPayload = (await firstResponse.json()) as {
      data: {
        attempt: { status: string };
        normalizedRecord: { eventType: string };
      };
    };
    expect(firstPayload.data.attempt.status).toBe("ingested");
    expect(firstPayload.data.normalizedRecord.eventType).toBe("ingest.record.normalized");
    expect(deliveryQueue.send).toHaveBeenCalledTimes(1);
    expect(deliveryQueue.send).toHaveBeenCalledWith(
      expect.objectContaining({ queueId: "queue-1", topicId: null, attempt: 0 }),
    );

    const secondResponse = await app.fetch(
      post(
        "/api/intake/mapping-suggestions/attempt-1/approve",
        { approvedSuggestionIds: ["suggestion-1"] },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue),
    );

    expect(secondResponse.status).toBe(200);
    expect(deliveryQueue.send).toHaveBeenCalledTimes(1);
  });

  it("marks the attempt as ingest_failed when queue publish fails during approval", async () => {
    bypassAuth(vi.mocked(authenticate));
    deliveryQueue.send.mockRejectedValueOnce(new Error("Queue send exploded"));
    const attempt = createAttemptRow();
    const state: FakeDbState = {
      attempts: [attempt],
      mappingVersions: [],
      messages: [],
      queues: [testQueue],
      topics: [],
    };
    vi.mocked(createDb).mockReturnValue(createFakeDb(state) as never);

    const response = await app.fetch(
      post(
        "/api/intake/mapping-suggestions/attempt-1/approve",
        { approvedSuggestionIds: ["suggestion-1"] },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(502);
    const payload = (await response.json()) as {
      message: string;
      data: { attempt: { status: string; ingestStatus: string } };
    };
    expect(payload.message).toBe("Queue send exploded");
    expect(payload.data.attempt.status).toBe("ingest_failed");
    expect(payload.data.attempt.ingestStatus).toBe("failed");
    expect(state.attempts[0]?.status).toBe("ingest_failed");
    expect(state.attempts[0]?.ingestStatus).toBe("failed");
  });

  it("returns 500 when the intakeAttempts INSERT returns no row", async () => {
    bypassAuth(vi.mocked(authenticate));
    vi.mocked(suggestMappings).mockResolvedValueOnce({
      kind: "success",
      batch: createAttemptRow().suggestionBatch!,
      decisionLog: {
        provider: "test-runner",
        model: "test-model",
        promptVersion: "payload-mapper-v1",
        validationOutcome: "passed",
        confidence: { average: 0.96, maximum: 0.96, minimum: 0.96, overall: 0.92 },
        judgeDisagreements: 0,
        judgeUnavailableCount: 0,
      },
    });
    const state: FakeDbState = {
      attempts: [],
      mappingVersions: [],
      messages: [],
      queues: [],
      topics: [],
    };
    vi.mocked(createDb).mockReturnValue(
      createFakeDb(state, { emptyIntakeAttemptInsert: true }) as never,
    );

    const response = await app.fetch(
      post(
        "/api/intake/mapping-suggestions",
        {
          contractId: "job-posting-v1",
          fixtureId: "ashby-job-001",
          queueId: "queue-1",
          sourceSystem: "manual",
        },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { status: string; message: string };
    expect(payload.status).toBe("error");
    expect(payload.message).toBe("Failed to record intake attempt");
  });

  it("returns 404 from the reject endpoint when UPDATE matches no row", async () => {
    bypassAuth(vi.mocked(authenticate));
    const attempt = createAttemptRow();
    const state: FakeDbState = {
      attempts: [attempt],
      mappingVersions: [],
      messages: [],
      queues: [],
      topics: [],
    };
    vi.mocked(createDb).mockReturnValue(
      createFakeDb(state, { emptyIntakeAttemptUpdate: true }) as never,
    );

    const response = await app.fetch(
      post(
        "/api/intake/mapping-suggestions/attempt-1/reject",
        { reason: "Not a match" },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as { status: string; message: string };
    expect(payload.status).toBe("error");
    expect(payload.message).toBe("Intake attempt not found");
  });

  it("returns 500 from the approve endpoint when the transaction returns no rows", async () => {
    bypassAuth(vi.mocked(authenticate));
    const attempt = createAttemptRow();
    const state: FakeDbState = {
      attempts: [attempt],
      mappingVersions: [],
      messages: [],
      queues: [
        {
          id: "queue-1",
          name: "Demo queue",
          ownerId: "user-123",
          retentionPeriod: 14,
          schema: null,
          pushEndpoint: "https://example.com/webhook",
          createdAt: new Date("2026-04-24T00:00:00.000Z"),
          updatedAt: new Date("2026-04-24T00:00:00.000Z"),
        },
      ],
      topics: [],
    };
    vi.mocked(createDb).mockReturnValue(
      createFakeDb(state, { emptyApprovedRevisionInsert: true }) as never,
    );

    const response = await app.fetch(
      post(
        "/api/intake/mapping-suggestions/attempt-1/approve",
        { approvedSuggestionIds: ["suggestion-1"] },
        AUTH_HEADER,
      ),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(500);
    expect(deliveryQueue.send).not.toHaveBeenCalled();
  });

  it("blocks approval when an inline review payload has expired", async () => {
    bypassAuth(vi.mocked(authenticate));
    const state: FakeDbState = {
      attempts: [
        createAttemptRow({
          sourceKind: "inline_payload",
          sourceFixtureId: null,
          reviewPayload: { title: "Expired" },
          reviewPayloadExpiresAt: new Date("2026-04-23T00:00:00.000Z"),
        }),
      ],
      mappingVersions: [],
      messages: [],
      queues: [],
      topics: [],
    };
    vi.mocked(createDb).mockReturnValue(createFakeDb(state) as never);

    const response = await app.fetch(
      post("/api/intake/mapping-suggestions/attempt-1/approve", {}, AUTH_HEADER),
      createMockEnv(deliveryQueue),
    );

    expect(response.status).toBe(410);
    expect(deliveryQueue.send).not.toHaveBeenCalled();
  });
});

describe("auto-heal fast path", () => {
  it("skips suggestMappings() when payload shape matches HealStreamDO fingerprint", async () => {
    bypassAuth(vi.mocked(authenticate));

    const testPayload = { first_name: "Alice" };
    const matchingFingerprint = shapeFingerprint(testPayload);

    // HealStreamDO returns approved state with a fingerprint matching the test payload shape.
    const healStream = createMockHealStream({
      approved: {
        fingerprint: matchingFingerprint,
        suggestions: [
          {
            id: "suggestion-heal-1",
            sourcePath: "/first_name",
            targetField: "first_name",
            transformKind: "copy",
            confidence: 1,
            explanation: "Direct field match.",
            evidenceSample: "Alice",
            deterministicValidation: {
              isValid: true,
              validatedAt: "2026-01-01T00:00:00.000Z",
              errors: [],
            },
            reviewStatus: "pending",
            replayStatus: "not_requested",
          },
        ],
        approvedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const state: FakeDbState = {
      attempts: [],
      mappingVersions: [],
      messages: [],
      queues: [],
      topics: [],
    };
    vi.mocked(createDb).mockReturnValue(createFakeDb(state) as never);

    await app.fetch(
      post(
        "/api/intake/mapping-suggestions",
        {
          contractId: "employee-v1",
          payload: testPayload,
          queueId: "queue-1",
          sourceSystem: "test",
        },
        AUTH_HEADER,
      ),
      createMockEnv(undefined, undefined, undefined, undefined, undefined, undefined, healStream),
    );

    // Critical assertion: LLM was never invoked on the fast path.
    expect(vi.mocked(suggestMappings)).not.toHaveBeenCalled();
  });
});
