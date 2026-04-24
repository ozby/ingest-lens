import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../index";
import { authenticate } from "../middleware/auth";
import { AUTH_HEADER, bypassAuth, createMockEnv, get, mockCreateDb } from "./helpers";

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

const mockEnv = createMockEnv();

function renderSqlFragment(fragment: unknown): string {
  if (!fragment) {
    return "";
  }

  if (Array.isArray(fragment)) {
    return fragment.map((part) => renderSqlFragment(part)).join("");
  }

  if (typeof fragment === "object") {
    if ("queryChunks" in fragment && Array.isArray(fragment.queryChunks)) {
      return renderSqlFragment(fragment.queryChunks);
    }

    if ("value" in fragment) {
      const value = fragment.value;
      return Array.isArray(value)
        ? value.map((part) => renderSqlFragment(part)).join("")
        : value instanceof Date
          ? value.toISOString()
          : String(value);
    }

    if ("name" in fragment && typeof fragment.name === "string") {
      return fragment.name;
    }
  }

  return String(fragment);
}

function renderSql(whereClause: unknown): string {
  return renderSqlFragment(whereClause).replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockImplementation(async (c: any) =>
    c.json({ status: "error", message: "Authentication required" }, 401),
  );
});

describe("Dashboard routes", () => {
  describe("GET /api/dashboard/server", () => {
    it("counts only currently leased messages as active", async () => {
      bypassAuth(vi.mocked(authenticate));

      const limitMock = vi.fn().mockResolvedValue([
        {
          id: "server-metrics-1",
          startTime: new Date("2026-01-01T00:00:00Z"),
          totalRequests: 13,
          activeConnections: 1,
          messagesProcessed: 5,
          errorCount: 1,
          avgResponseTime: 4.2,
        },
      ]);
      const metricsFromMock = vi.fn().mockReturnValue({ limit: limitMock });

      const totalQueuesFromMock = vi.fn().mockResolvedValue([{ totalQueues: 2 }]);
      const totalMessagesFromMock = vi.fn().mockResolvedValue([{ totalMessages: 4 }]);

      const activeMessagesWhereMock = vi.fn().mockResolvedValue([{ activeMessages: 1 }]);
      const activeMessagesFromMock = vi.fn().mockReturnValue({ where: activeMessagesWhereMock });

      const selectMock = vi
        .fn()
        .mockImplementationOnce(() => ({ from: metricsFromMock }))
        .mockImplementationOnce(() => ({ from: totalQueuesFromMock }))
        .mockImplementationOnce(() => ({ from: totalMessagesFromMock }))
        .mockImplementationOnce(() => ({ from: activeMessagesFromMock }));

      mockCreateDb({ select: selectMock });

      const res = await app.fetch(get("/api/dashboard/server", AUTH_HEADER), mockEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        data: {
          stats: {
            totalQueues: number;
            totalMessages: number;
            activeMessages: number;
          };
        };
      };
      expect(body.status).toBe("success");
      expect(body.data.stats.activeMessages).toBe(1);

      const activeMessagesWhereSql = renderSql(activeMessagesWhereMock.mock.calls[0]?.[0]);
      expect(activeMessagesWhereSql).toContain("received = true");
      expect(activeMessagesWhereSql).toContain("visibility_expires_at >");
    });
  });

  describe("GET /api/dashboard/server/activity", () => {
    it("returns contract-shaped activity history for authenticated users", async () => {
      bypassAuth(vi.mocked(authenticate));

      const activityHistory = [
        { time: "10:00", requests: 5, messages: 2, errors: 0 },
        { time: "11:00", requests: 8, messages: 3, errors: 1 },
      ];

      const limitMock = vi.fn().mockResolvedValue([
        {
          id: "server-metrics-1",
          startTime: new Date("2026-01-01T00:00:00Z"),
          totalRequests: 13,
          activeConnections: 1,
          messagesProcessed: 5,
          errorCount: 1,
          avgResponseTime: 4.2,
          activityHistory,
        },
      ]);
      const fromMock = vi.fn().mockReturnValue({ limit: limitMock });
      const selectMock = vi.fn().mockReturnValue({ from: fromMock });

      mockCreateDb({ select: selectMock });

      const res = await app.fetch(get("/api/dashboard/server/activity", AUTH_HEADER), mockEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        data: { activityHistory: typeof activityHistory };
      };
      expect(body.status).toBe("success");
      expect(body.data.activityHistory).toEqual(activityHistory);
    });
  });

  describe("GET /api/dashboard/queues", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(get("/api/dashboard/queues"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("returns only metrics for queues owned by the authenticated user", async () => {
      bypassAuth(vi.mocked(authenticate));

      const ownedQueues = [{ id: "queue-1" }];
      const ownedMetric = {
        id: "metric-1",
        queueId: "queue-1",
        messageCount: 2,
        messagesSent: 2,
        messagesReceived: 1,
        avgWaitTime: 0,
      };

      const ownedQueueWhereMock = vi.fn().mockResolvedValue(ownedQueues);
      const ownedQueueFromMock = vi.fn().mockReturnValue({ where: ownedQueueWhereMock });

      const queueMetricsWhereMock = vi.fn().mockResolvedValue([ownedMetric]);
      const queueMetricsFromMock = vi.fn().mockReturnValue({ where: queueMetricsWhereMock });

      const selectMock = vi
        .fn()
        .mockImplementationOnce(() => ({ from: ownedQueueFromMock }))
        .mockImplementationOnce(() => ({ from: queueMetricsFromMock }));

      mockCreateDb({ select: selectMock });

      const res = await app.fetch(get("/api/dashboard/queues", AUTH_HEADER), mockEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        results: number;
        data: { queueMetrics: Array<{ queueId: string }> };
      };
      expect(body.results).toBe(1);
      expect(body.data.queueMetrics).toEqual([ownedMetric]);
      expect(queueMetricsWhereMock).toHaveBeenCalledOnce();
    });
  });

  describe("GET /api/dashboard/queues/:queueId", () => {
    it("returns single-queue metrics under the shared queueMetrics key", async () => {
      bypassAuth(vi.mocked(authenticate));

      const metric = {
        id: "metric-1",
        queueId: "queue-1",
        messageCount: 2,
        messagesSent: 2,
        messagesReceived: 1,
        avgWaitTime: 0,
      };

      const oldestMessage = { createdAt: new Date("2026-01-01T00:00:00Z") };
      const queueLimitMock = vi.fn().mockResolvedValue([{ id: "queue-1", ownerId: "user-123" }]);
      const queueWhereMock = vi.fn().mockReturnValue({ limit: queueLimitMock });
      const queueFromMock = vi.fn().mockReturnValue({ where: queueWhereMock });

      const metricLimitMock = vi.fn().mockResolvedValue([metric]);
      const metricWhereMock = vi.fn().mockReturnValue({ limit: metricLimitMock });
      const metricFromMock = vi.fn().mockReturnValue({ where: metricWhereMock });

      const totalMessagesWhereMock = vi.fn().mockResolvedValue([{ totalMessages: 2 }]);
      const totalMessagesFromMock = vi.fn().mockReturnValue({ where: totalMessagesWhereMock });

      const activeMessagesWhereMock = vi.fn().mockResolvedValue([{ activeMessages: 1 }]);
      const activeMessagesFromMock = vi.fn().mockReturnValue({ where: activeMessagesWhereMock });

      const oldestLimitMock = vi.fn().mockResolvedValue([oldestMessage]);
      const oldestOrderByMock = vi.fn().mockReturnValue({ limit: oldestLimitMock });
      const oldestWhereMock = vi.fn().mockReturnValue({ orderBy: oldestOrderByMock });
      const oldestFromMock = vi.fn().mockReturnValue({ where: oldestWhereMock });

      const selectMock = vi
        .fn()
        .mockImplementationOnce(() => ({ from: queueFromMock }))
        .mockImplementationOnce(() => ({ from: metricFromMock }))
        .mockImplementationOnce(() => ({ from: totalMessagesFromMock }))
        .mockImplementationOnce(() => ({ from: activeMessagesFromMock }))
        .mockImplementationOnce(() => ({ from: oldestFromMock }));

      mockCreateDb({ select: selectMock });

      const res = await app.fetch(get("/api/dashboard/queues/queue-1", AUTH_HEADER), mockEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        data: {
          queueMetrics: typeof metric;
          stats: {
            totalMessages: number;
            activeMessages: number;
            oldestMessageAge: number;
          };
        };
      };
      expect(body.status).toBe("success");
      expect(body.data.queueMetrics).toEqual(metric);
      expect(body.data.stats.totalMessages).toBe(2);
      expect(body.data.stats.activeMessages).toBe(1);
      expect(body.data.stats.oldestMessageAge).toBeGreaterThanOrEqual(0);
      expect(body.data).not.toHaveProperty("queueMetric");

      const activeMessagesWhereSql = renderSql(activeMessagesWhereMock.mock.calls[0]?.[0]);
      expect(activeMessagesWhereSql).toContain("queue_id = queue-1");
      expect(activeMessagesWhereSql).toContain("received = true");
      expect(activeMessagesWhereSql).toContain("visibility_expires_at >");
    });
  });

  describe("GET /api/dashboard/intake", () => {
    it("returns owner-scoped intake counts and supports trace filtering", async () => {
      bypassAuth(vi.mocked(authenticate));

      const attempts = [
        {
          id: "attempt-1",
          ownerId: "user-123",
          mappingTraceId: "trace-1",
          status: "pending_review",
        },
        {
          id: "attempt-2",
          ownerId: "user-123",
          mappingTraceId: "trace-2",
          status: "ingested",
        },
      ];

      const whereMock = vi.fn().mockResolvedValue(attempts);
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      const selectMock = vi.fn().mockReturnValue({ from: fromMock });

      mockCreateDb({ select: selectMock });

      const res = await app.fetch(
        get("/api/dashboard/intake?mappingTraceId=trace-2", AUTH_HEADER),
        mockEnv,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          attempts: Array<{ id: string; mappingTraceId: string }>;
          counts: Record<string, number>;
        };
      };
      expect(body.data.attempts).toEqual([
        expect.objectContaining({ id: "attempt-2", mappingTraceId: "trace-2" }),
      ]);
      expect(body.data.counts).toEqual({ ingested: 1 });
    });
  });
});
