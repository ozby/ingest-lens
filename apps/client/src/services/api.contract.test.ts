import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthResponse,
  IMessage,
  IUser,
  IntakeAttemptRecord,
  IntakeApprovalData,
} from "@repo/types";

const axiosMocks = vi.hoisted(() => {
  const get = vi.fn();
  const post = vi.fn();
  const del = vi.fn();
  const requestUse = vi.fn();
  const responseUse = vi.fn();
  const client = {
    get,
    post,
    delete: del,
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  };

  return {
    get,
    post,
    del,
    requestUse,
    responseUse,
    create: vi.fn(() => client),
  };
});

vi.mock("axios", () => ({
  default: {
    create: axiosMocks.create,
  },
  create: axiosMocks.create,
}));

import apiService from "./api";

describe("api service contracts", () => {
  beforeEach(() => {
    axiosMocks.get.mockReset();
    axiosMocks.post.mockReset();
    axiosMocks.del.mockReset();
    localStorage.clear();
  });

  it("reads queue metrics from the shared queueMetrics key", async () => {
    const queueMetrics = {
      queueId: "queue-1",
      messageCount: 2,
      messagesSent: 2,
      messagesReceived: 1,
      avgWaitTime: 0,
    };

    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          queueMetrics,
          stats: {
            totalMessages: 2,
            activeMessages: 1,
            oldestMessageAge: 0,
          },
        },
      },
    });

    await expect(apiService.getQueueMetrics("queue-1")).resolves.toEqual(
      queueMetrics,
    );
    expect(axiosMocks.get).toHaveBeenCalledWith(
      "/api/dashboard/queues/queue-1",
    );
  });

  it("reads server activity history from the existing worker route", async () => {
    const activityHistory = [
      { time: "10:00", requests: 5, messages: 2, errors: 0 },
    ];

    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: { activityHistory },
      },
    });

    await expect(apiService.getServerActivityHistory()).resolves.toEqual(
      activityHistory,
    );
    expect(axiosMocks.get).toHaveBeenCalledWith(
      "/api/dashboard/server/activity",
    );
  });

  it("reads received messages from the shared messages payload", async () => {
    const messages: IMessage[] = [
      {
        id: "msg-1",
        data: { key: "value" },
        queueId: "queue-1",
        received: false,
        receivedAt: new Date("2026-01-01T00:00:30Z"),
        receivedCount: 0,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        visibilityExpiresAt: new Date("2026-01-01T00:00:30Z"),
        expiresAt: new Date("2030-01-01T00:00:00Z"),
      },
    ];

    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          messages,
          visibilityTimeout: 30,
        },
      },
    });

    await expect(
      apiService.receiveMessages("queue-1", { maxMessages: 1 }),
    ).resolves.toEqual(messages);
    expect(axiosMocks.get).toHaveBeenCalledWith("/api/messages/queue-1", {
      params: { maxMessages: 1 },
    });
  });

  it("reads single-message payloads from the shared message key", async () => {
    const message: IMessage = {
      id: "msg-1",
      data: { key: "value" },
      queueId: "queue-1",
      received: false,
      receivedAt: null,
      receivedCount: 0,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      visibilityExpiresAt: null,
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    };

    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: { message },
      },
    });

    await expect(apiService.getMessage("queue-1", "msg-1")).resolves.toEqual(
      message,
    );
    expect(axiosMocks.get).toHaveBeenCalledWith("/api/messages/queue-1/msg-1");
  });

  it("reads delete acknowledgements from the shared deletedMessageId key", async () => {
    axiosMocks.del.mockResolvedValueOnce({
      data: {
        status: "success",
        data: { deletedMessageId: "msg-1" },
      },
    });

    await expect(apiService.deleteMessage("queue-1", "msg-1")).resolves.toBe(
      "msg-1",
    );
    expect(axiosMocks.del).toHaveBeenCalledWith("/api/messages/queue-1/msg-1");
  });

  it("reads login responses with the shared user payload including updatedAt", async () => {
    const user: IUser = {
      id: "user-1",
      username: "testuser",
      email: "test@example.com",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    };
    const authResponse: AuthResponse = {
      token: "token-123",
      user,
    };

    axiosMocks.post.mockResolvedValueOnce({
      data: {
        status: "success",
        data: authResponse,
      },
    });

    await expect(
      apiService.login({ username: "testuser", password: "password123" }),
    ).resolves.toEqual(authResponse);
    expect(axiosMocks.post).toHaveBeenCalledWith("/api/auth/login", {
      username: "testuser",
      password: "password123",
    });
    expect(localStorage.getItem("authToken")).toBe("token-123");
  });

  it("reads current-user responses with the shared user payload including updatedAt", async () => {
    const user: IUser = {
      id: "user-1",
      username: "testuser",
      email: "test@example.com",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    };

    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: { user },
      },
    });

    await expect(apiService.getCurrentUser()).resolves.toEqual(user);
    expect(axiosMocks.get).toHaveBeenCalledWith("/api/auth/me");
  });

  it("creates mapping-suggestion attempts from the intake helper", async () => {
    const attempt: IntakeAttemptRecord = {
      intakeAttemptId: "attempt-1",
      mappingTraceId: "trace-1",
      contractId: "order-created-v1",
      contractVersion: "1.0.0",
      sourceSystem: "webhook-provider-a",
      sourceKind: "inline_payload",
      sourceHash: "hash-1",
      deliveryTarget: { queueId: "q-1" },
      status: "pending_review",
      ingestStatus: "not_started",
      driftCategory: "renamed_field",
      modelName: "gpt-test",
      promptVersion: "payload-mapper-v1",
      overallConfidence: 0.81,
      redactedSummary: "Sanitized payload preview",
      validationErrors: [],
      createdAt: new Date("2026-04-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2026-04-01T00:00:00Z").toISOString(),
    };

    axiosMocks.post.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          attempt,
        },
      },
    });

    await expect(
      apiService.createIntakeSuggestion({
        sourceSystem: "webhook-provider-a",
        contractId: "order-created-v1",
        payload: { id: "x" },
      }),
    ).resolves.toEqual(attempt);
    expect(axiosMocks.post).toHaveBeenCalledWith(
      "/api/intake/mapping-suggestions",
      {
        sourceSystem: "webhook-provider-a",
        contractId: "order-created-v1",
        payload: { id: "x" },
      },
    );
  });

  it("reads pending intake attempts from the list helper", async () => {
    const attempts = [
      {
        intakeAttemptId: "attempt-1",
        mappingTraceId: "trace-1",
        contractId: "order-created-v1",
        contractVersion: "1.0.0",
        sourceSystem: "webhook-provider-a",
        sourceKind: "inline_payload",
        sourceHash: "hash-1",
        deliveryTarget: { queueId: "q-1" },
        status: "pending_review",
        ingestStatus: "not_started",
        driftCategory: "renamed_field",
        modelName: "gpt-test",
        promptVersion: "payload-mapper-v1",
        overallConfidence: 0.8,
        redactedSummary: "Sanitized payload preview",
        validationErrors: [],
        createdAt: new Date("2026-04-01T00:00:00Z").toISOString(),
        updatedAt: new Date("2026-04-01T00:00:00Z").toISOString(),
      } as IntakeAttemptRecord,
    ];

    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          attempts,
          results: 1,
        },
      },
    });

    await expect(apiService.getIntakeSuggestions("pending_review")).resolves.toEqual(
      attempts,
    );
    expect(axiosMocks.get).toHaveBeenCalledWith(
      "/api/intake/mapping-suggestions",
      { params: { status: "pending_review" } },
    );
  });

  it("approves a mapping attempt and returns mapping metadata", async () => {
    const response: IntakeApprovalData = {
      attempt: {
        intakeAttemptId: "attempt-1",
        mappingTraceId: "trace-1",
        contractId: "order-created-v1",
        contractVersion: "1.0.0",
        sourceSystem: "webhook-provider-a",
        sourceKind: "inline_payload",
        sourceHash: "hash-1",
        deliveryTarget: { queueId: "q-1" },
        status: "ingested",
        ingestStatus: "ingested",
        driftCategory: "renamed_field",
        modelName: "gpt-test",
        promptVersion: "payload-mapper-v1",
        overallConfidence: 0.9,
        redactedSummary: "Sanitized payload preview",
        validationErrors: [],
        createdAt: new Date("2026-04-01T00:00:00Z").toISOString(),
        updatedAt: new Date("2026-04-01T00:00:00Z").toISOString(),
      },
      mappingVersion: {
        mappingVersionId: "mapping-v1",
        intakeAttemptId: "attempt-1",
        mappingTraceId: "trace-1",
        contractId: "order-created-v1",
        contractVersion: "1.0.0",
        targetRecordType: "order_created",
        approvedSuggestionIds: ["s-1"],
        sourceHash: "hash-1",
        sourceKind: "inline_payload",
        deliveryTarget: { queueId: "q-1" },
        createdAt: new Date("2026-04-01T00:00:00Z").toISOString(),
      },
    };

    axiosMocks.post.mockResolvedValueOnce({
      data: {
        status: "success",
        data: response,
      },
    });

    await expect(
      apiService.approveIntakeSuggestion("attempt-1", { approvedSuggestionIds: ["s-1"] }),
    ).resolves.toEqual(response);
    expect(axiosMocks.post).toHaveBeenCalledWith(
      "/api/intake/mapping-suggestions/attempt-1/approve",
      { approvedSuggestionIds: ["s-1"] },
    );
  });

  it("rejects a mapping attempt with reason", async () => {
    const attempt: IntakeAttemptRecord = {
      intakeAttemptId: "attempt-1",
      mappingTraceId: "trace-1",
      contractId: "order-created-v1",
      contractVersion: "1.0.0",
      sourceSystem: "webhook-provider-a",
      sourceKind: "inline_payload",
      sourceHash: "hash-1",
      deliveryTarget: { queueId: "q-1" },
      status: "rejected",
      ingestStatus: "not_started",
      driftCategory: "renamed_field",
      modelName: "gpt-test",
      promptVersion: "payload-mapper-v1",
      overallConfidence: 0.4,
      redactedSummary: "Sanitized payload preview",
      validationErrors: [],
      rejectionReason: "Bad mapping",
      createdAt: new Date("2026-04-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2026-04-01T00:00:00Z").toISOString(),
    };

    axiosMocks.post.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          attempt,
        },
      },
    });

    await expect(apiService.rejectIntakeSuggestion("attempt-1", { reason: "Bad mapping" })).resolves.toEqual(
      attempt,
    );
    expect(axiosMocks.post).toHaveBeenCalledWith(
      "/api/intake/mapping-suggestions/attempt-1/reject",
      { reason: "Bad mapping" },
    );
  });

  it("loads public fixture metadata catalog from intake fixture endpoint", async () => {
    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          fixtures: [
            {
              id: "ashby-job-001",
              sourceSystem: "ashby",
              sourceUrl: "https://example.com/ashby",
              summary: "Staff Software Engineer sample",
              contractHint: "job-posting-v1",
            },
          ],
        },
      },
    });

    await expect(apiService.getPublicFixtures()).resolves.toEqual([
      {
        id: "ashby-job-001",
        sourceSystem: "ashby",
        sourceUrl: "https://example.com/ashby",
        summary: "Staff Software Engineer sample",
        contractHint: "job-posting-v1",
      },
    ]);

    expect(axiosMocks.get).toHaveBeenCalledWith(
      "/api/intake/public-fixtures",
    );
  });

  it("loads a public fixture payload by id from intake fixture endpoint", async () => {
    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          fixture: {
            id: "ashby-job-001",
            sourceSystem: "ashby",
            sourceUrl: "https://example.com/ashby",
            contractHint: "job-posting-v1",
            payload: {
              title: "Staff Engineer",
            },
          },
        },
      },
    });

    await expect(apiService.getPublicFixtureById("ashby-job-001")).resolves.toEqual({
      id: "ashby-job-001",
      sourceSystem: "ashby",
      sourceUrl: "https://example.com/ashby",
      contractHint: "job-posting-v1",
      payload: {
        title: "Staff Engineer",
      },
    });

    expect(axiosMocks.get).toHaveBeenCalledWith(
      "/api/intake/public-fixtures/ashby-job-001",
    );
  });
});
