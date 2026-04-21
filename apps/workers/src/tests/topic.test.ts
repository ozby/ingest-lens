import { describe, it, expect, vi } from "vitest";
import app from "../index";

vi.mock("../db/client", () => ({
  createDb: vi.fn(() => ({})),
}));

const mockEnv = {
  HYPERDRIVE: null as any,
  DATABASE_URL: "postgresql://localhost/test",
  JWT_SECRET: "test-secret",
};

describe("Topic routes", () => {
  describe("GET /api/topics", () => {
    it("returns 401 when not authenticated", async () => {
      const req = new Request("http://localhost/api/topics");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/topics", () => {
    it("returns 401 when not authenticated", async () => {
      const req = new Request("http://localhost/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test-topic" }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/topics/:topicId/subscribe", () => {
    it("returns 401 when not authenticated", async () => {
      const req = new Request("http://localhost/api/topics/some-id/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: "queue-id" }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/topics/:topicId/publish", () => {
    it("returns 401 when not authenticated", async () => {
      const req = new Request("http://localhost/api/topics/some-id/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { key: "value" } }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });
});
