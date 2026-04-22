import { describe, it, expect, vi } from "vitest";
import app from "../index";
import { createMockEnv, post, get, del } from "./helpers";

vi.mock("../db/client", () => ({
  createDb: vi.fn(() => ({})),
}));

const mockEnv = createMockEnv();

describe("Queue routes", () => {
  describe("GET /api/queues", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(get("/api/queues"), mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/queues", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(post("/api/queues", { name: "test-queue" }), mockEnv);
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/queues/:id", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(del("/api/queues/some-id"), mockEnv);
      expect(res.status).toBe(401);
    });
  });
});
