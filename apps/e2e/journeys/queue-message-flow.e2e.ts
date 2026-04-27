import { describe, expect, it } from "vitest";
import { getE2EBaseUrlOrThrow } from "../src/journeys/env";
import { deleteJson, getJson, postJson } from "../src/journeys/http";
import type { ApiError, ApiSuccess, AuthResponse } from "../src/journeys/types";

const baseUrl = getE2EBaseUrlOrThrow("apps/e2e/journeys/queue-message-flow.e2e.ts");

type QueueRecord = {
  id: string;
  name: string;
  ownerId: string;
  retentionPeriod: number;
  schema: Record<string, unknown> | null;
  pushEndpoint: string | null;
  createdAt: string;
};

type MessageRecord = {
  id: string;
  seq: string;
  queueId: string;
  data: Record<string, unknown>;
  received: boolean;
  receivedCount: number;
  createdAt: string;
};

type DeleteMessageResponse = {
  deletedMessageId: string;
};

describe("queue message flow", () => {
  it("creates a queue, sends a message, receives it, acks it, and leaves the queue empty", async () => {
    const runId = crypto.randomUUID().slice(0, 8);
    const credentials = {
      username: `queue-user-${runId}`,
      email: `queue-user-${runId}@example.test`,
      password: `Pass-${runId}`,
    };

    const registration = await postJson<AuthResponse>(baseUrl, "/api/auth/register", credentials);
    expect(registration.response.status).toBe(201);
    expect(registration.body.status).toBe("success");

    const token = registration.body.data.token;
    const queueName = `orders-${runId}`;

    const unauthorizedQueue = await postJson<ApiError>(baseUrl, "/api/queues", { name: queueName });
    expect(unauthorizedQueue.response.status).toBe(401);
    expect(unauthorizedQueue.body).toMatchObject({
      status: "error",
      message: "Authentication required",
    });

    const createdQueue = await postJson<ApiSuccess<{ queue: QueueRecord }>>(
      baseUrl,
      "/api/queues",
      {
        name: queueName,
        retentionPeriod: 7,
      },
      token,
    );
    expect(createdQueue.response.status).toBe(201);
    expect(createdQueue.body.data.queue).toMatchObject({
      name: queueName,
      ownerId: registration.body.data.user.id,
      retentionPeriod: 7,
      pushEndpoint: null,
    });

    const queueId = createdQueue.body.data.queue.id;
    const payload = {
      kind: "queue-flow",
      runId,
      nested: { step: "send" },
    };

    const sentMessage = await postJson<ApiSuccess<{ message: MessageRecord }>>(
      baseUrl,
      `/api/messages/${queueId}`,
      { data: payload },
      token,
    );
    expect(sentMessage.response.status).toBe(201);
    expect(sentMessage.body.data.message).toMatchObject({
      queueId,
      data: payload,
      received: false,
      receivedCount: 0,
      seq: expect.any(String),
    });

    const receivedMessages = await getJson<
      ApiSuccess<{ messages: MessageRecord[]; visibilityTimeout: number }>
    >(baseUrl, `/api/messages/${queueId}`, token);
    expect(receivedMessages.response.status).toBe(200);
    expect(receivedMessages.body.results).toBe(1);
    expect(receivedMessages.body.data.visibilityTimeout).toBe(30);
    expect(receivedMessages.body.data.messages).toHaveLength(1);
    expect(receivedMessages.body.data.messages[0]).toMatchObject({
      id: sentMessage.body.data.message.id,
      queueId,
      data: payload,
      seq: expect.any(String),
    });

    const ackedMessage = await deleteJson<ApiSuccess<DeleteMessageResponse>>(
      baseUrl,
      `/api/messages/${queueId}/${sentMessage.body.data.message.id}`,
      token,
    );
    expect(ackedMessage.response.status).toBe(200);
    expect(ackedMessage.body).toEqual({
      status: "success",
      data: { deletedMessageId: sentMessage.body.data.message.id },
    });

    const queueAfterAck = await getJson<
      ApiSuccess<{ messages: MessageRecord[]; visibilityTimeout: number }>
    >(baseUrl, `/api/messages/${queueId}`, token);
    expect(queueAfterAck.response.status).toBe(200);
    expect(queueAfterAck.body.results).toBe(0);
    expect(queueAfterAck.body.data.messages).toEqual([]);
    expect(queueAfterAck.body.data.visibilityTimeout).toBe(30);
  });
});
