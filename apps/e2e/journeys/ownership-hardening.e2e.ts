import { describe, expect, it } from "vitest";
import { getE2EBaseUrlOrThrow } from "../src/journeys/env";
import { getJson, postJson } from "../src/journeys/http";
import type { ApiError, ApiSuccess, AuthResponse } from "../src/journeys/types";

const baseUrl = getE2EBaseUrlOrThrow("apps/e2e/journeys/ownership-hardening.e2e.ts");

type QueueRecord = {
  id: string;
  name: string;
  ownerId: string;
};

type TopicRecord = {
  id: string;
  name: string;
  ownerId: string;
  subscribedQueues: string[];
};

type QueueMetric = {
  queueId: string;
  messageCount: number;
};

type MessageRecord = {
  id: string;
  queueId: string;
};

describe("ownership hardening", () => {
  it("rejects cross-tenant queue, dashboard, topic subscribe, and websocket access", async () => {
    const runId = crypto.randomUUID().slice(0, 8);
    const ownerCredentials = {
      username: `owner-${runId}`,
      email: `owner-${runId}@example.test`,
      password: `Pass-${runId}`,
    };
    const intruderCredentials = {
      username: `intruder-${runId}`,
      email: `intruder-${runId}@example.test`,
      password: `Pass-${runId}`,
    };

    const ownerRegistration = await postJson<AuthResponse>(
      baseUrl,
      "/api/auth/register",
      ownerCredentials,
    );
    expect(ownerRegistration.response.status).toBe(201);
    const ownerToken = ownerRegistration.body.data.token;

    const intruderRegistration = await postJson<AuthResponse>(
      baseUrl,
      "/api/auth/register",
      intruderCredentials,
    );
    expect(intruderRegistration.response.status).toBe(201);
    const intruderToken = intruderRegistration.body.data.token;

    const ownerQueue = await postJson<ApiSuccess<{ queue: QueueRecord }>>(
      baseUrl,
      "/api/queues",
      { name: `owner-queue-${runId}` },
      ownerToken,
    );
    expect(ownerQueue.response.status).toBe(201);

    const intruderQueue = await postJson<ApiSuccess<{ queue: QueueRecord }>>(
      baseUrl,
      "/api/queues",
      { name: `intruder-queue-${runId}` },
      intruderToken,
    );
    expect(intruderQueue.response.status).toBe(201);

    const ownerTopic = await postJson<ApiSuccess<{ topic: TopicRecord }>>(
      baseUrl,
      "/api/topics",
      { name: `owner-topic-${runId}` },
      ownerToken,
    );
    expect(ownerTopic.response.status).toBe(201);

    const intruderTopic = await postJson<ApiSuccess<{ topic: TopicRecord }>>(
      baseUrl,
      "/api/topics",
      { name: `intruder-topic-${runId}` },
      intruderToken,
    );
    expect(intruderTopic.response.status).toBe(201);

    const ownerMessage = await postJson<ApiSuccess<{ message: MessageRecord }>>(
      baseUrl,
      `/api/messages/${ownerQueue.body.data.queue.id}`,
      { data: { runId, lane: "owner" } },
      ownerToken,
    );
    expect(ownerMessage.response.status).toBe(201);

    const intruderMessage = await postJson<ApiSuccess<{ message: MessageRecord }>>(
      baseUrl,
      `/api/messages/${intruderQueue.body.data.queue.id}`,
      { data: { runId, lane: "intruder" } },
      intruderToken,
    );
    expect(intruderMessage.response.status).toBe(201);

    const ownerDashboard = await getJson<ApiSuccess<{ queueMetrics: QueueMetric[] }>>(
      baseUrl,
      "/api/dashboard/queues",
      ownerToken,
    );
    expect(ownerDashboard.response.status).toBe(200);
    expect(ownerDashboard.body.data.queueMetrics).toEqual([
      expect.objectContaining({
        queueId: ownerQueue.body.data.queue.id,
        messageCount: 1,
      }),
    ]);

    const intruderDashboard = await getJson<ApiSuccess<{ queueMetrics: QueueMetric[] }>>(
      baseUrl,
      "/api/dashboard/queues",
      intruderToken,
    );
    expect(intruderDashboard.response.status).toBe(200);
    expect(intruderDashboard.body.data.queueMetrics).toEqual([
      expect.objectContaining({
        queueId: intruderQueue.body.data.queue.id,
        messageCount: 1,
      }),
    ]);

    const foreignQueueReceive = await getJson<ApiError>(
      baseUrl,
      `/api/messages/${ownerQueue.body.data.queue.id}`,
      intruderToken,
    );
    expect(foreignQueueReceive.response.status).toBe(403);
    expect(foreignQueueReceive.body).toMatchObject({
      status: "error",
      message: "Not authorized to access this queue",
    });

    const foreignQueueMetrics = await getJson<ApiError>(
      baseUrl,
      `/api/dashboard/queues/${ownerQueue.body.data.queue.id}`,
      intruderToken,
    );
    expect(foreignQueueMetrics.response.status).toBe(403);
    expect(foreignQueueMetrics.body).toMatchObject({
      status: "error",
      message: "Not authorized to view metrics for this queue",
    });

    const foreignTopicSubscribe = await postJson<ApiError>(
      baseUrl,
      `/api/topics/${ownerTopic.body.data.topic.id}/subscribe`,
      { queueId: intruderQueue.body.data.queue.id },
      intruderToken,
    );
    expect(foreignTopicSubscribe.response.status).toBe(403);
    expect(foreignTopicSubscribe.body).toMatchObject({
      status: "error",
      message: "Not authorized to modify this topic",
    });

    const foreignQueueOnOwnedTopic = await postJson<ApiError>(
      baseUrl,
      `/api/topics/${ownerTopic.body.data.topic.id}/subscribe`,
      { queueId: intruderQueue.body.data.queue.id },
      ownerToken,
    );
    expect(foreignQueueOnOwnedTopic.response.status).toBe(403);
    expect(foreignQueueOnOwnedTopic.body).toMatchObject({
      status: "error",
      message: "Not authorized to access this queue",
    });

    const websocketOwnership = await getJson<ApiError>(
      baseUrl,
      `/api/topics/${ownerTopic.body.data.topic.id}/ws`,
      intruderToken,
    );
    expect(websocketOwnership.response.status).toBe(403);
    expect(websocketOwnership.body).toMatchObject({
      status: "error",
      message: "Not authorized to access this topic",
    });

    const ownedTopicSubscribe = await postJson<ApiSuccess<{ topic: TopicRecord }>>(
      baseUrl,
      `/api/topics/${intruderTopic.body.data.topic.id}/subscribe`,
      { queueId: intruderQueue.body.data.queue.id },
      intruderToken,
    );
    expect(ownedTopicSubscribe.response.status).toBe(200);
    expect(ownedTopicSubscribe.body.data.topic.subscribedQueues).toContain(
      intruderQueue.body.data.queue.id,
    );
  });

  it("allows same-tenant access to own queue", async () => {
    const runId = crypto.randomUUID().slice(0, 8);
    const credentials = {
      username: `tenant-${runId}`,
      email: `tenant-${runId}@example.test`,
      password: `Pass-${runId}`,
    };

    const registration = await postJson<AuthResponse>(baseUrl, "/api/auth/register", credentials);
    expect(registration.response.status).toBe(201);
    const token = registration.body.data.token;
    const ownerId = registration.body.data.user.id;

    const created = await postJson<ApiSuccess<{ queue: QueueRecord }>>(
      baseUrl,
      "/api/queues",
      { name: `tenant-queue-${runId}` },
      token,
    );
    expect(created.response.status).toBe(201);
    const createdQueue = created.body.data.queue;

    const fetched = await getJson<ApiSuccess<{ queue: QueueRecord }>>(
      baseUrl,
      `/api/queues/${createdQueue.id}`,
      token,
    );
    expect(fetched.response.status).toBe(200);
    expect(fetched.body.data.queue).toMatchObject({
      id: createdQueue.id,
      name: `tenant-queue-${runId}`,
      ownerId,
    });
  });
});
