import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "./auth";
import type { Env } from "../db/client";

const { createBetterAuthMock } = vi.hoisted(() => ({
  createBetterAuthMock: vi.fn(),
}));

vi.mock("../auth/better-auth-server", () => ({
  createBetterAuth: createBetterAuthMock,
}));

function createEnv(): Env {
  return {
    DATABASE_URL: "postgres://example.test/db",
    BETTER_AUTH_SECRET: "better-auth-secret",
    JWT_SECRET: "jwt-secret",
    HYPERDRIVE: {} as Env["HYPERDRIVE"],
    DELIVERY_QUEUE: {} as Env["DELIVERY_QUEUE"],
    RATE_LIMITER: {} as Env["RATE_LIMITER"],
    AUTH_RATE_LIMITER: {} as Env["AUTH_RATE_LIMITER"],
    ANALYTICS: {} as Env["ANALYTICS"],
    TOPIC_ROOMS: {} as Env["TOPIC_ROOMS"],
    HEAL_STREAM: {} as Env["HEAL_STREAM"],
    KV: undefined as unknown as Env["KV"],
    ALLOWED_ORIGIN: "https://dev.ingest-lens.ozby.dev",
    AI: undefined,
  };
}

function buildApp() {
  const app = new Hono<{
    Bindings: Env;
    Variables: { user: { jti: string; userId: string; username: string } };
  }>();
  app.use("/protected", authenticate);
  app.get("/protected", (c) => {
    return c.json({
      status: "success",
      data: c.get("user"),
    });
  });
  return app;
}

describe("authenticate middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("accepts a BetterAuth session cookie when no bearer token is present", async () => {
    createBetterAuthMock.mockReturnValue({
      handler: vi.fn().mockResolvedValue(
        Response.json({
          user: { id: "user-123", name: "operator", email: "operator@example.com" },
          session: { id: "session-1" },
        }),
      ),
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: "user-123", name: "operator", email: "operator@example.com" },
          session: { id: "session-1" },
        }),
      },
    });

    const response = await buildApp().fetch(
      new Request("https://api.dev.ingest-lens.ozby.dev/protected", {
        headers: {
          cookie: "better-auth.session_token=session-1",
          origin: "https://dev.ingest-lens.ozby.dev",
        },
      }),
      createEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "success",
      data: {
        jti: "better-auth-session",
        userId: "user-123",
        username: "operator",
      },
    });
  });

  it("rejects the request when neither bearer token nor BetterAuth session is valid", async () => {
    createBetterAuthMock.mockReturnValue({
      handler: vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })),
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    });

    const response = await buildApp().fetch(
      new Request("https://api.dev.ingest-lens.ozby.dev/protected"),
      createEnv(),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
      message: "Authentication required",
    });
  });
});
