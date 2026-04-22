import { describe, it, expect, vi, beforeEach } from "vitest";
import { TopicRoom } from "../do/TopicRoom";

function makeRequest(method: string, path: string, body?: unknown): Request {
  return new Request(`http://do-host${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("TopicRoom", () => {
  describe("GET /ws", () => {
    it("calls acceptWebSocket and returns 101 status", async () => {
      const mockServer = {} as WebSocket;
      const mockClient = {} as WebSocket;
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
      };

      vi.stubGlobal("WebSocketPair", function () {
        return { 0: mockClient, 1: mockServer };
      });
      // Node's Response rejects status 101 (CF Workers-only); stub to allow it
      vi.stubGlobal(
        "Response",
        class {
          status: number;
          constructor(_body: null, init?: { status?: number }) {
            this.status = init?.status ?? 200;
          }
        },
      );

      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const res = await room.fetch(makeRequest("GET", "/ws"));

      expect(mockCtx.acceptWebSocket).toHaveBeenCalledOnce();
      expect(mockCtx.acceptWebSocket).toHaveBeenCalledWith(mockServer);
      expect(res.status).toBe(101);
    });
  });

  describe("POST /notify", () => {
    it("broadcasts JSON payload to all connected sockets", async () => {
      const mockSocket1 = { send: vi.fn() };
      const mockSocket2 = { send: vi.fn() };
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([mockSocket1, mockSocket2]),
      };

      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const payload = { event: "update", topicId: "topic-1" };
      const res = await room.fetch(makeRequest("POST", "/notify", payload));

      expect(res.status).toBe(200);
      expect(mockCtx.getWebSockets).toHaveBeenCalledOnce();
      expect(mockSocket1.send).toHaveBeenCalledOnce();
      expect(mockSocket1.send).toHaveBeenCalledWith(JSON.stringify(payload));
      expect(mockSocket2.send).toHaveBeenCalledOnce();
      expect(mockSocket2.send).toHaveBeenCalledWith(JSON.stringify(payload));
    });

    it("is a no-op when no clients are connected", async () => {
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
      };

      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const payload = { event: "update", topicId: "topic-1" };
      const res = await room.fetch(makeRequest("POST", "/notify", payload));

      expect(res.status).toBe(200);
      expect(mockCtx.getWebSockets).toHaveBeenCalledOnce();
    });
  });

  describe("unknown routes", () => {
    it("returns 404 for unrecognized paths", async () => {
      const mockCtx = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
      };

      const room = new TopicRoom(mockCtx as unknown as DurableObjectState);
      const res = await room.fetch(makeRequest("GET", "/unknown"));

      expect(res.status).toBe(404);
    });
  });
});
