import { describe, it, expect, vi, beforeEach } from "vitest";
import { TopicRoom } from "../do/TopicRoom";

function makeRequest(method: string, path: string, body?: unknown): Request {
  return new Request(`http://do-host${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

type ReplayRecord = {
  cursor: number;
  seq: string;
  payload: string;
  createdAt: number;
};

function createSqlMock(seed: ReplayRecord[] = []) {
  const rows = [...seed];
  let nextCursor = rows.reduce((max, row) => Math.max(max, row.cursor), 0) + 1;

  const exec = vi.fn((query: string, ...bindings: unknown[]) => {
    const normalized = query.replace(/\s+/g, " ").trim();

    if (normalized.startsWith("CREATE TABLE IF NOT EXISTS msg_log")) {
      return cursor([]);
    }

    if (normalized.startsWith("INSERT INTO msg_log")) {
      const [seq, payload, createdAt] = bindings as [string, string, number];
      rows.push({ cursor: nextCursor, seq, payload, createdAt });
      nextCursor += 1;
      return cursor([]);
    }

    if (normalized === "SELECT last_insert_rowid() AS replayCursor") {
      return cursor([{ replayCursor: nextCursor - 1 }]);
    }

    if (normalized.startsWith("DELETE FROM msg_log WHERE created_at < ?")) {
      const [cutoff] = bindings as [number];
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].createdAt < cutoff) {
          rows.splice(index, 1);
        }
      }
      return cursor([]);
    }

    if (normalized.startsWith("SELECT replay_cursor AS replayCursor, payload FROM msg_log")) {
      const [cursorValue] = bindings as [string];
      const filtered = rows
        .filter((row) => row.cursor > Number(cursorValue))
        .sort((left, right) => left.cursor - right.cursor)
        .map((row) => ({ replayCursor: row.cursor, payload: row.payload }));
      return cursor(filtered);
    }

    throw new Error(`Unexpected SQL: ${normalized}`);
  });

  return { exec, rows };
}

function cursor<T extends Record<string, unknown>>(rows: T[]) {
  return {
    toArray: () => rows,
    one: () => rows[0],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TopicRoom", () => {
  describe("GET /ws", () => {
    it("calls acceptWebSocket with a real WebSocket and returns 101 status", async () => {
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
      };

      // No WebSocketPair stub needed — real CF Workers runtime provides it
      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const res = await room.fetch(makeRequest("GET", "/ws"));

      expect(mockCtx.acceptWebSocket).toHaveBeenCalledOnce();
      const [socket] = mockCtx.acceptWebSocket.mock.calls[0] as [WebSocket];
      expect(socket).toBeInstanceOf(WebSocket);
      expect(res.status).toBe(101);
    });
  });

  describe("POST /notify", () => {
    it("broadcasts JSON payload to all connected sockets", async () => {
      const mockSocket1 = { send: vi.fn() };
      const mockSocket2 = { send: vi.fn() };
      const { exec, rows } = createSqlMock();
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([mockSocket1, mockSocket2]),
        storage: { sql: { exec } },
      };

      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const payload = { event: "update", topicId: "topic-1", seq: "42" };
      const res = await room.fetch(makeRequest("POST", "/notify", payload));

      expect(res.status).toBe(200);
      expect(mockCtx.getWebSockets).toHaveBeenCalledOnce();
      expect(mockSocket1.send).toHaveBeenCalledOnce();
      expect(mockSocket1.send).toHaveBeenCalledWith(JSON.stringify({ ...payload, cursor: "1" }));
      expect(mockSocket2.send).toHaveBeenCalledOnce();
      expect(mockSocket2.send).toHaveBeenCalledWith(JSON.stringify({ ...payload, cursor: "1" }));
      expect(rows).toEqual([
        {
          cursor: 1,
          seq: "42",
          payload: JSON.stringify(payload),
          createdAt: expect.any(Number),
        },
      ]);
    });

    it("is a no-op when no clients are connected", async () => {
      const { exec } = createSqlMock();
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
        storage: { sql: { exec } },
      };

      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const payload = { event: "update", topicId: "topic-1", seq: "42" };
      const res = await room.fetch(makeRequest("POST", "/notify", payload));

      expect(res.status).toBe(200);
      expect(mockCtx.getWebSockets).toHaveBeenCalledOnce();
    });

    it("evicts rows older than the replay retention window", async () => {
      const now = new Date("2026-04-22T12:00:00.000Z").valueOf();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      try {
        const { exec, rows } = createSqlMock([
          {
            cursor: 1,
            seq: "1",
            payload: JSON.stringify({ seq: "1", topicId: "topic-1" }),
            createdAt: now - 60 * 60 * 1000 - 1,
          },
        ]);
        const mockCtx = {
          acceptWebSocket: vi.fn(),
          getWebSockets: vi.fn().mockReturnValue([]),
          storage: { sql: { exec } },
        };

        const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
        const payload = { seq: "2", topicId: "topic-1" };
        const res = await room.fetch(makeRequest("POST", "/notify", payload));

        expect(res.status).toBe(200);
        expect(rows).toEqual([
          {
            cursor: 2,
            seq: "2",
            payload: JSON.stringify(payload),
            createdAt: now,
          },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("GET /ws replay", () => {
    it("replays by DO-issued cursor order even when seq arrives out of order", async () => {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const sendSpy = vi.spyOn(server, "send");
      const { exec, rows } = createSqlMock();
      const mockCtx = {
        acceptWebSocket: vi.fn((socket: WebSocket) => socket.accept()),
        getWebSockets: vi.fn().mockReturnValue([]),
        storage: { sql: { exec } },
      };

      const WebSocketPairStub = vi.fn(function WebSocketPairStub() {
        return {
          0: client,
          1: server,
        };
      });
      vi.stubGlobal("WebSocketPair", WebSocketPairStub);

      try {
        const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
        await room.fetch(makeRequest("POST", "/notify", { seq: "10", messageId: "msg-10" }));
        await room.fetch(makeRequest("POST", "/notify", { seq: "9", messageId: "msg-9" }));
        const res = await room.fetch(makeRequest("GET", "/ws?cursor=1"));

        expect(res.status).toBe(101);
        expect(mockCtx.acceptWebSocket).toHaveBeenCalledWith(server);
        expect(rows).toEqual([
          {
            cursor: 1,
            seq: "10",
            payload: JSON.stringify({ seq: "10", messageId: "msg-10" }),
            createdAt: expect.any(Number),
          },
          {
            cursor: 2,
            seq: "9",
            payload: JSON.stringify({ seq: "9", messageId: "msg-9" }),
            createdAt: expect.any(Number),
          },
        ]);
        expect(sendSpy).toHaveBeenCalledTimes(1);
        expect(sendSpy).toHaveBeenNthCalledWith(
          1,
          JSON.stringify({ seq: "9", messageId: "msg-9", cursor: "2" }),
        );
      } finally {
        (client as WebSocket & { accept?: () => void }).accept?.();
        try {
          server.close();
        } catch {
          // allow the pool to reclaim the accepted server end
        }
        try {
          client.close();
        } catch {
          // client end was never accepted in the test harness
        }
      }
    });

    it("returns 400 before upgrade when cursor is malformed", async () => {
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
        storage: { sql: { exec: vi.fn() } },
      };

      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const res = await room.fetch(makeRequest("GET", "/ws?cursor=abc"));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        status: "error",
        message: "cursor must be a decimal string",
      });
      expect(mockCtx.acceptWebSocket).not.toHaveBeenCalled();
    });
  });

  describe("unknown routes", () => {
    it("returns 404 for unrecognized paths", async () => {
      const { exec } = createSqlMock();
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
        storage: { sql: { exec } },
      };

      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const res = await room.fetch(makeRequest("GET", "/unknown"));

      expect(res.status).toBe(404);
    });
  });
});
