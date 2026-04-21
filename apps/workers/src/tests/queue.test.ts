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

describe("Queue routes", () => {
  describe("GET /api/queues", () => {
    it("returns 401 when not authenticated", async () => {
      const req = new Request("http://localhost/api/queues");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/queues", () => {
    it("returns 401 when not authenticated", async () => {
      const req = new Request("http://localhost/api/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test-queue" }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/queues/:id", () => {
    it("returns 401 when not authenticated", async () => {
      const req = new Request("http://localhost/api/queues/some-id", {
        method: "DELETE",
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });
});
