import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../db/client";
import { rateLimiter } from "../middleware/rateLimiter";
import { createMockEnv } from "./helpers";

type TestVariables = {
  user: { jti: string; userId: string; username: string };
};

function buildTestApp(mockEnv: Env) {
  const app = new Hono<{ Bindings: Env; Variables: TestVariables }>();

  app.use("*", (c, next) => {
    c.set("user", { jti: "bypass-jti", userId: "user-1", username: "testuser" });
    return next();
  });
  app.use("*", rateLimiter);
  app.get("/test", (c) => c.json({ status: "ok" }));

  return (req: Request) => app.fetch(req, mockEnv);
}

describe("rateLimiter middleware", () => {
  it("allows request through when RATE_LIMITER binding is unavailable", async () => {
    const mockEnv = createMockEnv();
    delete mockEnv.RATE_LIMITER;
    const fetch = buildTestApp(mockEnv);

    const res = await fetch(new Request("http://localhost/test"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("allows request through when rate limit is not exceeded", async () => {
    const mockRateLimiter = { limit: vi.fn().mockResolvedValue({ success: true }) };
    const mockEnv = createMockEnv(undefined, mockRateLimiter);
    const fetch = buildTestApp(mockEnv);

    const res = await fetch(new Request("http://localhost/test"));

    expect(res.status).toBe(200);
    expect(mockRateLimiter.limit).toHaveBeenCalledWith({ key: "user-1" });
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("returns 429 with Retry-After: 60 when rate limit is exceeded", async () => {
    const mockRateLimiter = { limit: vi.fn().mockResolvedValue({ success: false }) };
    const mockEnv = createMockEnv(undefined, mockRateLimiter);
    const fetch = buildTestApp(mockEnv);

    const res = await fetch(new Request("http://localhost/test"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(mockRateLimiter.limit).toHaveBeenCalledWith({ key: "user-1" });
    const body = (await res.json()) as { status: string; message: string };
    expect(body.status).toBe("error");
    expect(body.message).toBe("Rate limit exceeded");
  });
});
