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
