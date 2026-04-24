import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../index";
import { createDb } from "../db/client";
import { generateToken, hashPasswordAsync, verifyPassword } from "../auth/crypto";
import {
  buildInsertChain,
  buildSelectChain,
  buildUpdateChain,
  createMockEnv,
  get,
  mockCreateDb,
  post,
} from "./helpers";

vi.mock("../db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client")>();
  return { ...actual, createDb: vi.fn() };
});

const mockEnv = createMockEnv();

function mockRegisteredUser() {
  return {
    id: "user-1",
    username: "testuser",
    email: "test@example.com",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  };
}

function expectPbkdf2HashFormat(hash: string): void {
  expect(hash).toMatch(/^pbkdf2\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
}

function expectJwtFormat(token: string): void {
  expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
}

beforeEach(() => {
  vi.clearAllMocks();

  const { selectMock } = buildSelectChain([]);
  const { insertMock } = buildInsertChain([mockRegisteredUser()]);
  const { updateMock } = buildUpdateChain();

  mockCreateDb({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  });
});

describe("Auth routes", () => {
  describe("password hashing", () => {
    it("stores equal passwords with unique salts in pbkdf2 format", async () => {
      const [firstHash, secondHash] = await Promise.all([
        hashPasswordAsync("password123"),
        hashPasswordAsync("password123"),
      ]);

      expectPbkdf2HashFormat(firstHash);
      expectPbkdf2HashFormat(secondHash);
      expect(firstHash).not.toBe(secondHash);
    });

    it("verifies a matching pbkdf2 password", async () => {
      const hash = await hashPasswordAsync("password123");

      await expect(verifyPassword("password123", hash)).resolves.toBe(true);
    });

    it("rejects a wrong password for a pbkdf2 hash", async () => {
      const hash = await hashPasswordAsync("password123");

      await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
    });

    it("rejects a hash with non-pbkdf2 prefix", async () => {
      await expect(verifyPassword("any", "sha256$1$aa$bb")).resolves.toBe(false);
    });

    it("rejects a hash with missing segments", async () => {
      await expect(verifyPassword("any", "pbkdf2$310000$salt")).resolves.toBe(false);
    });

    it("rejects a hash with extra segments", async () => {
      await expect(verifyPassword("any", "pbkdf2$1$a$b$c")).resolves.toBe(false);
    });

    it("rejects a hash with non-integer iterations", async () => {
      await expect(verifyPassword("any", "pbkdf2$abc$aa$bb")).resolves.toBe(false);
    });

    it("rejects a hash with zero iterations", async () => {
      await expect(verifyPassword("any", "pbkdf2$0$aa$bb")).resolves.toBe(false);
    });

    it("rejects a hash with empty hash segment", async () => {
      await expect(verifyPassword("any", "pbkdf2$310000$aa$")).resolves.toBe(false);
    });
  });

  describe("POST /api/auth/register", () => {
    it("returns 400 when username is missing", async () => {
      const res = await app.fetch(
        post("/api/auth/register", {
          email: "a@b.com",
          password: "password123",
        }),
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
        post("/api/auth/register", {
          username: "testuser",
          email: "a@b.com",
          password: "abc",
        }),
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
      const body = (await res.json()) as {
        status: string;
        data: {
          token: string;
          user: {
            id: string;
            username: string;
            email: string;
            createdAt: string;
            updatedAt: string;
          };
        };
      };
      expect(body.status).toBe("success");
      expectJwtFormat(body.data.token);
      expect(body.data.user.updatedAt).toBe(mockRegisteredUser().updatedAt.toISOString());

      const db = vi.mocked(createDb).mock.results[0]?.value as {
        insert: ReturnType<typeof vi.fn>;
      };
      const valuesMock = db.insert.mock.results[0]?.value.values as ReturnType<typeof vi.fn>;
      const returningMock = valuesMock.mock.results[0]?.value.returning as
        | ReturnType<typeof vi.fn>
        | undefined;
      const [projection] = returningMock?.mock.calls[0] ?? [];

      expect(Object.keys(projection ?? {}).sort()).toEqual([
        "createdAt",
        "email",
        "id",
        "updatedAt",
        "username",
      ]);
    });

    it("returns 500 when the users INSERT returns no row", async () => {
      const { selectMock } = buildSelectChain([]);
      const { insertMock } = buildInsertChain([]);
      mockCreateDb({
        select: selectMock,
        insert: insertMock,
      });

      const res = await app.fetch(
        post("/api/auth/register", {
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        }),
        mockEnv,
      );

      expect(res.status).toBe(500);
      const body = (await res.json()) as { status: string; message: string };
      expect(body.status).toBe("error");
      expect(body.message).toBe("Failed to create user");
    });

    it("stores new passwords in pbkdf2 format", async () => {
      await app.fetch(
        post("/api/auth/register", {
          username: "testuser",
          email: "test@example.com",
          password: "password123",
        }),
        mockEnv,
      );

      const db = vi.mocked(createDb).mock.results[0]?.value as {
        insert: ReturnType<typeof vi.fn>;
      };
      const valuesMock = db.insert.mock.results[0]?.value.values as ReturnType<typeof vi.fn>;
      const [{ password }] = valuesMock.mock.calls[0] ?? [];

      expectPbkdf2HashFormat(password);
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 when credentials are missing", async () => {
      const res = await app.fetch(post("/api/auth/login", { username: "testuser" }), mockEnv);
      expect(res.status).toBe(400);
    });

    it("returns the shared auth user payload including updatedAt", async () => {
      const loginUser = {
        ...mockRegisteredUser(),
        password: await hashPasswordAsync("password123"),
      };
      const { selectMock } = buildSelectChain([loginUser]);

      mockCreateDb({
        select: selectMock,
      });

      const res = await app.fetch(
        post("/api/auth/login", {
          username: "testuser",
          password: "password123",
        }),
        mockEnv,
      );

      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        status: string;
        data: {
          token: string;
          user: {
            id: string;
            username: string;
            email: string;
            createdAt: string;
            updatedAt: string;
          };
        };
      };

      expect(body.status).toBe("success");
      expect(body.data.user.updatedAt).toBe(loginUser.updatedAt.toISOString());
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

    it("returns the shared auth user payload including updatedAt", async () => {
      const currentUser = mockRegisteredUser();
      const { selectMock } = buildSelectChain([currentUser]);

      mockCreateDb({
        select: selectMock,
      });

      const token = await generateToken(currentUser.id, currentUser.username, mockEnv.JWT_SECRET);

      const res = await app.fetch(
        get("/api/auth/me", { Authorization: `Bearer ${token}` }),
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(selectMock).toHaveBeenCalledWith(
        expect.objectContaining({ updatedAt: expect.anything() }),
      );

      const body = (await res.json()) as {
        status: string;
        data: {
          user: {
            id: string;
            username: string;
            email: string;
            createdAt: string;
            updatedAt: string;
          };
        };
      };

      expect(body.status).toBe("success");
      expect(body.data.user.updatedAt).toBe(currentUser.updatedAt.toISOString());
    });
  });
});
