import { describe, expect, it } from "vitest";
import { hashPasswordAsync, verifyPassword } from "../auth/crypto";

function expectPbkdf2HashFormat(hash: string): void {
  expect(hash).toMatch(/^pbkdf2\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
}

describe("Auth crypto", () => {
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
});
