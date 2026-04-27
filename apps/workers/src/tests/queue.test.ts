import { beforeEach, describe, it, expect, vi } from "vitest";
import app from "../index";
import { authenticate } from "../middleware/auth";
import {
  AUTH_HEADER,
  buildInsertChain,
  bypassAuth,
  createMockEnv,
  mockCreateDb,
  mockQueue,
  post,
  get,
  del,
} from "./helpers";

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

const mockEnv = createMockEnv();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockImplementation(async (c: any) =>
    c.json({ status: "error", message: "Authentication required" }, 401),
  );
});

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

    it("returns 500 when the queues INSERT returns no row", async () => {
      bypassAuth(vi.mocked(authenticate));
      const { insertMock } = buildInsertChain([]);
      mockCreateDb({ insert: insertMock });

      const res = await app.fetch(
        post("/api/queues", { name: "test-queue" }, AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(500);
      const body = (await res.json()) as { status: string; message: string };
      expect(body.status).toBe("error");
      expect(body.message).toBe("Failed to create queue");
    });
  });

  describe("DELETE /api/queues/:id", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(del("/api/queues/some-id"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("deletes the queue and relies on database cascades for dependent rows", async () => {
      bypassAuth(vi.mocked(authenticate));

      const limitMock = vi.fn().mockResolvedValue([mockQueue]);
      const whereSelectMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereSelectMock });
      const selectMock = vi.fn().mockReturnValue({ from: fromMock });
      const whereDeleteMock = vi.fn().mockResolvedValue([]);
      const deleteMock = vi.fn().mockReturnValue({ where: whereDeleteMock });

      mockCreateDb({
        select: selectMock,
        delete: deleteMock,
      });

      const res = await app.fetch(del("/api/queues/queue-1", AUTH_HEADER), mockEnv);

      expect(res.status).toBe(200);
      expect(deleteMock).toHaveBeenCalledTimes(1);
    });
  });
});
