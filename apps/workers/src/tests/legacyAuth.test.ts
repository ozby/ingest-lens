import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../index";
import { authenticate } from "../middleware/auth";
import {
  AUTH_HEADER,
  buildInsertChain,
  buildUnboundedSelectChain,
  bypassAuth,
  createMockEnv,
  get,
  mockCreateDb,
  post,
} from "./helpers";
import { generateToken, hashPasswordAsync, verifyPassword } from "../auth/crypto";

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

vi.mock("../auth/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/crypto")>();
  return {
    ...actual,
    generateToken: vi.fn().mockResolvedValue("legacy-token"),
    hashPasswordAsync: vi.fn().mockResolvedValue("hashed-password"),
    verifyPassword: vi.fn(),
  };
});

const mockEnv = createMockEnv();

const mockUser = {
  id: "user-1",
  username: "operator",
  email: "operator@example.com",
  password: "hashed-password",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockImplementation(async (c: any) =>
    c.json({ status: "error", message: "Authentication required" }, 401),
  );
});

describe("Legacy auth compatibility routes", () => {
  describe("POST /api/auth/register", () => {
    it("rejects missing required fields", async () => {
      const res = await app.fetch(
        post("/api/auth/register", { email: "operator@example.com" }),
        mockEnv,
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { status: string; message: string };
      expect(body.status).toBe("error");
      expect(body.message).toContain("username, email, and password are required");
    });

    it("returns 409 when the username or email already exists", async () => {
      const { selectMock } = buildUnboundedSelectChain([mockUser]);
      mockCreateDb({ select: selectMock });

      const res = await app.fetch(
        post("/api/auth/register", {
          username: "operator",
          email: "operator@example.com",
          password: "Pass-123!",
        }),
        mockEnv,
      );

      expect(res.status).toBe(409);
      const body = (await res.json()) as { status: string; message: string };
      expect(body.message).toBe("User already exists");
    });

    it("creates a legacy token response when the user is new", async () => {
      const { selectMock } = buildUnboundedSelectChain([]);
      const { insertMock, valuesMock } = buildInsertChain([mockUser]);
      mockCreateDb({ select: selectMock, insert: insertMock });

      const res = await app.fetch(
        post("/api/auth/register", {
          username: "operator",
          email: "Operator@Example.com",
          password: "Pass-123!",
        }),
        mockEnv,
      );

      expect(res.status).toBe(201);
      expect(hashPasswordAsync).toHaveBeenCalledWith("Pass-123!");
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "operator",
          email: "operator@example.com",
          password: "hashed-password",
        }),
      );
      expect(generateToken).toHaveBeenCalledWith("user-1", "operator", mockEnv.JWT_SECRET);

      const body = (await res.json()) as {
        status: string;
        data: { token: string; user: { email: string; username: string } };
      };
      expect(body.status).toBe("success");
      expect(body.data.token).toBe("legacy-token");
      expect(body.data.user).toEqual(
        expect.objectContaining({
          email: "operator@example.com",
          username: "operator",
        }),
      );
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 401 for invalid credentials", async () => {
      const { selectMock } = buildUnboundedSelectChain([]);
      mockCreateDb({ select: selectMock });

      const res = await app.fetch(
        post("/api/auth/login", {
          username: "operator",
          password: "wrong",
        }),
        mockEnv,
      );

      expect(res.status).toBe(401);
    });

    it("returns token and user for valid credentials", async () => {
      const { selectMock } = buildUnboundedSelectChain([mockUser]);
      mockCreateDb({ select: selectMock });
      vi.mocked(verifyPassword).mockResolvedValue(true);

      const res = await app.fetch(
        post("/api/auth/login", {
          email: "operator@example.com",
          password: "Pass-123!",
        }),
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(verifyPassword).toHaveBeenCalledWith("Pass-123!", "hashed-password");
      expect(generateToken).toHaveBeenCalledWith("user-1", "operator", mockEnv.JWT_SECRET);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await app.fetch(get("/api/auth/me"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("returns the authenticated legacy user", async () => {
      bypassAuth(vi.mocked(authenticate));
      const { selectMock } = buildUnboundedSelectChain([mockUser]);
      mockCreateDb({ select: selectMock });

      const res = await app.fetch(get("/api/auth/me", AUTH_HEADER), mockEnv);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        data: { user: { id: string; username: string; email: string } };
      };
      expect(body.status).toBe("success");
      expect(body.data.user).toEqual(
        expect.objectContaining({
          id: "user-1",
          username: "operator",
          email: "operator@example.com",
        }),
      );
    });
  });
});
