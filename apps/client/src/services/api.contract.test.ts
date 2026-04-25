import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse, IMessage, IUser } from "@repo/types";

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

    await expect(apiService.getQueueMetrics("queue-1")).resolves.toEqual(queueMetrics);
    expect(axiosMocks.get).toHaveBeenCalledWith("/api/dashboard/queues/queue-1");
  });

  it("reads server activity history from the existing worker route", async () => {
    const activityHistory = [{ time: "10:00", requests: 5, messages: 2, errors: 0 }];

    axiosMocks.get.mockResolvedValueOnce({
      data: {
        status: "success",
        data: { activityHistory },
      },
    });

    await expect(apiService.getServerActivityHistory()).resolves.toEqual(activityHistory);
    expect(axiosMocks.get).toHaveBeenCalledWith("/api/dashboard/server/activity");
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

    await expect(apiService.receiveMessages("queue-1", { maxMessages: 1 })).resolves.toEqual(
      messages,
    );
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

    await expect(apiService.getMessage("queue-1", "msg-1")).resolves.toEqual(message);
    expect(axiosMocks.get).toHaveBeenCalledWith("/api/messages/queue-1/msg-1");
  });

  it("reads delete acknowledgements from the shared deletedMessageId key", async () => {
    axiosMocks.del.mockResolvedValueOnce({
      data: {
        status: "success",
        data: { deletedMessageId: "msg-1" },
      },
    });

    await expect(apiService.deleteMessage("queue-1", "msg-1")).resolves.toBe("msg-1");
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
});
