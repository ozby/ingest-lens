import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index";
import { authenticate } from "../middleware/auth";
import { AUTH_HEADER, bypassAuth, createMockEnv, mockCreateDb } from "./helpers";

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

const mockDeliveryQueue = { send: vi.fn() };

function makeMockEnv(healStreamOverride?: any) {
  return createMockEnv(
    mockDeliveryQueue,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    healStreamOverride,
  );
}

function setupEmptyRollbackDb() {
  mockCreateDb({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockImplementation(async (c: any) =>
    c.json({ status: "error", message: "Authentication required" }, 401),
  );
});

describe("GET /api/heal/stream/:sourceSystem/:contractId/:contractVersion", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await app.fetch(
      new Request("https://api.ozby.dev/api/heal/stream/ashby/ats-postings/v1", {
        headers: { "Content-Type": "application/json" },
      }),
      makeMockEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("delegates to HealStreamDO /subscribe with correct DO name", async () => {
    bypassAuth(vi.mocked(authenticate));
    const subscribeFetch = vi.fn().mockResolvedValue(
      new Response("data: test\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const healStream = {
      idFromName: vi.fn().mockReturnValue({} as any),
      get: vi.fn().mockReturnValue({ fetch: subscribeFetch }),
    };
    const env = makeMockEnv(healStream);

    const res = await app.fetch(
      new Request("https://api.ozby.dev/api/heal/stream/ashby/ats-postings/v1", {
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      }),
      env,
    );

    expect(res.status).toBe(200);
    expect(healStream.idFromName).toHaveBeenCalledWith("ashby:ats-postings:v1");
    expect(subscribeFetch).toHaveBeenCalled();
  });
});

describe("PATCH /api/heal/stream/:sourceSystem/:contractId/:contractVersion/rollback", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await app.fetch(
      new Request("https://api.ozby.dev/api/heal/stream/ashby/ats-postings/v1/rollback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      }),
      makeMockEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when no approved revision exists", async () => {
    bypassAuth(vi.mocked(authenticate));
    setupEmptyRollbackDb();

    const res = await app.fetch(
      new Request("https://api.ozby.dev/api/heal/stream/ashby/ats-postings/v1/rollback", {
        method: "PATCH",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      }),
      makeMockEnv(),
    );
    expect(res.status).toBe(404);
  });
});
