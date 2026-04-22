import { describe, it, expect, vi } from "vitest";
import app from "../index";
import { createMockEnv, post, get } from "./helpers";

vi.mock("../db/client", () => ({
  createDb: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "user-1",
            username: "testuser",
            email: "test@example.com",
            createdAt: new Date("2026-01-01"),
          },
        ]),
      }),
    }),
  })),
}));

const mockEnv = createMockEnv();

describe("Auth routes", () => {
  describe("POST /api/auth/register", () => {
    it("returns 400 when username is missing", async () => {
      const res = await app.fetch(
        post("/api/auth/register", { email: "a@b.com", password: "password123" }),
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when email is invalid", async () => {
      const res = await app.fetch(
        post("/api/auth/register", {
          username: "testuser",
          email: "not-an-email",
          password: "password123",
        }),
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when password is too short", async () => {
      const res = await app.fetch(
        post("/api/auth/register", { username: "testuser", email: "a@b.com", password: "abc" }),
        mockEnv,
      );
      expect(res.status).toBe(400);
    });

    it("returns 201 with valid data", async () => {
      const res = await app.fetch(
        post("/api/auth/register", {
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        }),
        mockEnv,
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { status: string; data: { token: string } };
      expect(body.status).toBe("success");
      expect(body.data.token).toBeDefined();
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 when credentials are missing", async () => {
      const res = await app.fetch(post("/api/auth/login", { username: "testuser" }), mockEnv);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without auth header", async () => {
      const res = await app.fetch(get("/api/auth/me"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await app.fetch(
        get("/api/auth/me", { Authorization: "Bearer invalid.token.here" }),
        mockEnv,
      );
      expect(res.status).toBe(401);
    });
  });
});
