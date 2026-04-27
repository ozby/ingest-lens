import { describe, expect, it } from "vitest";
import { getE2EBaseUrlOrThrow } from "../src/journeys/env";
import { getJson, postJson } from "../src/journeys/http";
import type { ApiError, ApiSuccess, AuthResponse } from "../src/journeys/types";

const baseUrl = getE2EBaseUrlOrThrow("apps/e2e/journeys/topic-publish-flow.e2e.ts");

type QueueRecord = {
  id: string;
  name: string;
  subscribedQueues?: string[];
};

type TopicRecord = {
  id: string;
  name: string;
  ownerId: string;
  subscribedQueues: string[];
  createdAt: string;
};

type MessageRecord = {
  id: string;
  seq: string;
  queueId: string;
  data: Record<string, unknown>;
};

describe("topic publish flow", () => {
  it("publishes to a subscribed queue and rejects publishing without subscribers", async () => {
    const runId = crypto.randomUUID().slice(0, 8);
    const credentials = {
      username: `topic-user-${runId}`,
      email: `topic-user-${runId}@example.test`,
      password: `Pass-${runId}`,
    };

    const registration = await postJson<AuthResponse>(baseUrl, "/api/auth/register", credentials);
    expect(registration.response.status).toBe(201);
    const token = registration.body.data.token;

    const queue = await postJson<ApiSuccess<{ queue: QueueRecord }>>(
      baseUrl,
      "/api/queues",
      { name: `subscriber-${runId}` },
      token,
    );
    expect(queue.response.status).toBe(201);

    const topic = await postJson<ApiSuccess<{ topic: TopicRecord }>>(
      baseUrl,
      "/api/topics",
      { name: `events-${runId}` },
      token,
    );
    expect(topic.response.status).toBe(201);
    expect(topic.body.data.topic).toMatchObject({
      name: `events-${runId}`,
      ownerId: registration.body.data.user.id,
      subscribedQueues: [],
    });

    const payload = {
      kind: "topic-flow",
      runId,
      nested: { step: "publish" },
    };

    const publishWithoutSubscribers = await postJson<ApiError>(
      baseUrl,
      `/api/topics/${topic.body.data.topic.id}/publish`,
      { data: payload },
      token,
    );
    expect(publishWithoutSubscribers.response.status).toBe(400);
    expect(publishWithoutSubscribers.body).toMatchObject({
      status: "error",
      message: "Topic has no subscribers",
    });

    const subscribedTopic = await postJson<ApiSuccess<{ topic: TopicRecord }>>(
      baseUrl,
      `/api/topics/${topic.body.data.topic.id}/subscribe`,
      { queueId: queue.body.data.queue.id },
      token,
    );
    expect(subscribedTopic.response.status).toBe(200);
    expect(subscribedTopic.body.data.topic.subscribedQueues).toContain(queue.body.data.queue.id);

    const published = await postJson<ApiSuccess<{ messages: MessageRecord[] }>>(
      baseUrl,
      `/api/topics/${topic.body.data.topic.id}/publish`,
      { data: payload },
      token,
    );
    expect(published.response.status).toBe(201);
    expect(published.body.results).toBe(1);
    expect(published.body.data.messages).toHaveLength(1);
    expect(published.body.data.messages[0]).toMatchObject({
      queueId: queue.body.data.queue.id,
      data: payload,
      seq: expect.any(String),
    });

    const received = await getJson<
      ApiSuccess<{ messages: MessageRecord[]; visibilityTimeout: number }>
    >(baseUrl, `/api/messages/${queue.body.data.queue.id}`, token);
    expect(received.response.status).toBe(200);
    expect(received.body.results).toBe(1);
    expect(received.body.data.messages).toHaveLength(1);
    expect(received.body.data.messages[0]).toMatchObject({
      id: published.body.data.messages[0].id,
      queueId: queue.body.data.queue.id,
      data: payload,
      seq: expect.any(String),
    });
  });
});
