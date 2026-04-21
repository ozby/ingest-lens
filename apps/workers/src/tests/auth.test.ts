import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index";

// Mock database calls so tests run without a real Postgres connection
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

const mockEnv = {
  HYPERDRIVE: null as any,
  DATABASE_URL: "postgresql://localhost/test",
  JWT_SECRET: "test-secret-for-unit-tests",
};

describe("Auth routes", () => {
  describe("POST /api/auth/register", () => {
    it("returns 400 when username is missing", async () => {
      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: "password123" }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(400);
    });

    it("returns 400 when email is invalid", async () => {
      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "testuser",
          email: "not-an-email",
          password: "password123",
        }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(400);
    });

    it("returns 400 when password is too short", async () => {
      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "testuser",
          email: "a@b.com",
          password: "abc",
        }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(400);
    });

    it("returns 201 with valid data", async () => {
      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.status).toBe("success");
      expect(body.data.token).toBeDefined();
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 when credentials are missing", async () => {
      const req = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser" }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without auth header", async () => {
      const req = new Request("http://localhost/api/auth/me");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const req = new Request("http://localhost/api/auth/me", {
        headers: { Authorization: "Bearer invalid.token.here" },
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });
});
