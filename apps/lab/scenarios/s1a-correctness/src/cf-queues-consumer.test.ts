import { describe, it, expect, vi, type Mock } from "vitest";
import {
  handleLabS1aBatch,
  InMemoryReceiveStore,
  type QueueMessage,
  type MessageBatch,
} from "./cf-queues-consumer";
import type { Message } from "./message";

interface TestMsg {
  body: Message;
  id: string;
  timestamp: Date;
  ack: Mock;
  retry: Mock;
}

function makeMsg(body: Message, id = "msg-1"): TestMsg {
  return {
    body,
    id,
    timestamp: new Date("2026-01-01"),
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function makeBatch(messages: TestMsg[]): MessageBatch<Message> {
  return {
    messages: messages as unknown as QueueMessage<Message>[],
    queue: "lab-s1a-cf-queues",
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
}

describe("handleLabS1aBatch", () => {
  it("records all messages and acks them", async () => {
    const store = new InMemoryReceiveStore();
    const msgs = [
      makeMsg({ msg_id: "id-1", seq: 1, session_id: "s1", payload: "p1" }, "m1"),
      makeMsg({ msg_id: "id-2", seq: 2, session_id: "s1", payload: "p2" }, "m2"),
    ];
    const batch = makeBatch(msgs);

    await handleLabS1aBatch(batch, store);

    expect(msgs[0]!.ack).toHaveBeenCalledOnce();
    expect(msgs[1]!.ack).toHaveBeenCalledOnce();

    const records = store.getBySession("s1");
    expect(records).toHaveLength(2);
    expect(records[0]!.msgId).toBe("id-1");
    expect(records[1]!.msgId).toBe("id-2");
  });

  it("assigns ascending recvOrder per session", async () => {
    const store = new InMemoryReceiveStore();
    const msgs = [
      makeMsg({ msg_id: "a", seq: 5, session_id: "sess-x", payload: "px" }, "m1"),
      makeMsg({ msg_id: "b", seq: 1, session_id: "sess-x", payload: "py" }, "m2"),
    ];
    await handleLabS1aBatch(makeBatch(msgs), store);

    const records = store.getBySession("sess-x");
    expect(records[0]!.recvOrder).toBe(1);
    expect(records[1]!.recvOrder).toBe(2);
  });

  it("never writes records for a different session_id", async () => {
    const store = new InMemoryReceiveStore();
    const msgs = [makeMsg({ msg_id: "x", seq: 1, session_id: "sess-a", payload: "p" }, "m1")];
    await handleLabS1aBatch(makeBatch(msgs), store);

    expect(store.getBySession("sess-b")).toHaveLength(0);
    expect(store.getBySession("sess-a")).toHaveLength(1);
  });

  it("retries a poisoned message and emits failure", async () => {
    const store = new InMemoryReceiveStore();
    // Poisoned message: missing required fields
    const poisoned = {
      body: {} as Message,
      id: "poison",
      timestamp: new Date("2026-01-01"),
      ack: vi.fn(),
      retry: vi.fn(),
    };
    await handleLabS1aBatch(makeBatch([poisoned]), store);

    expect(poisoned.retry).toHaveBeenCalledOnce();
    expect(poisoned.ack).not.toHaveBeenCalled();
  });

  it("handles multiple sessions independently", async () => {
    const store = new InMemoryReceiveStore();
    const msgs = [
      makeMsg({ msg_id: "a1", seq: 1, session_id: "s1", payload: "p" }, "m1"),
      makeMsg({ msg_id: "b1", seq: 1, session_id: "s2", payload: "p" }, "m2"),
    ];
    await handleLabS1aBatch(makeBatch(msgs), store);

    expect(store.getBySession("s1")).toHaveLength(1);
    expect(store.getBySession("s2")).toHaveLength(1);
    // recvOrder resets per session
    expect(store.getBySession("s1")[0]!.recvOrder).toBe(1);
    expect(store.getBySession("s2")[0]!.recvOrder).toBe(1);
  });
});
