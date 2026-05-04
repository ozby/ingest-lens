import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  generateToken,
  hashPasswordAsync,
  verifyPassword,
} from "./crypto";

const PBKDF2_HASH_REGEX = /^pbkdf2\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/;

describe("hashPasswordAsync", () => {
  it("produces unique salts for equal inputs", async () => {
    const password = "hunter2-long-enough";
    const first = await hashPasswordAsync(password);
    const second = await hashPasswordAsync(password);

    expect(first).not.toBe(second);
    expect(first).toMatch(PBKDF2_HASH_REGEX);
    expect(second).toMatch(PBKDF2_HASH_REGEX);
  });

  it("emits the pbkdf2 prefix and the configured iteration count", async () => {
    const hash = await hashPasswordAsync("another-password-value");
    const segments = hash.split("$");

    expect(segments).toHaveLength(4);
    expect(segments[0]).toBe("pbkdf2");
    expect(segments[1]).toBe("100000");
    expect(segments[2]?.length ?? 0).toBeGreaterThan(0);
    expect(segments[3]?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("verifyPassword", () => {
  it("round-trips a freshly generated hash", async () => {
    const password = "round-trip-password";
    const hash = await hashPasswordAsync(password);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("returns false when the candidate password differs", async () => {
    const hash = await hashPasswordAsync("correct-password");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it.each([
    ["empty string", ""],
    ["missing segments", "pbkdf2$310000$only-two-segments"],
    ["wrong prefix", "bcrypt$310000$c2FsdA$aGFzaA"],
    ["non-numeric iterations", "pbkdf2$notanumber$c2FsdA$aGFzaA"],
    ["zero iterations", "pbkdf2$0$c2FsdA$aGFzaA"],
    ["too many segments", "pbkdf2$310000$c2FsdA$aGFzaA$extra"],
  ])("returns false for malformed input (%s)", async (_label, malformed) => {
    await expect(verifyPassword("any-candidate", malformed)).resolves.toBe(false);
  });
});

describe("generateToken", () => {
  it("produces a three-segment base64url JWT", async () => {
    const token = await generateToken("user-1", "alice", "test-secret");
    const segments = token.split(".");

    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("encodes the userId and username into the payload", async () => {
    const token = await generateToken("user-42", "bob", "secret-value", 3600);
    const segments = token.split(".");
    const payloadB64 = segments[1];
    if (!payloadB64) {
      throw new Error("token missing payload segment");
    }
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as {
      userId: string;
      username: string;
      exp: number;
      iat: number;
    };

    expect(payload.userId).toBe("user-42");
    expect(payload.username).toBe("bob");
    expect(payload.exp - payload.iat).toBe(3600);
  });
});

describe("base64Url codec", () => {
  it.each([
    ["empty string", ""],
    ["ascii text", "hello world"],
    ["padding-sensitive length", "abc"],
    ["symbols that force +/ in plain base64", "??>>"],
  ])("round-trips ASCII input (%s)", (_label, input) => {
    const encoded = base64UrlEncode(input);
    const decoded = new TextDecoder().decode(base64UrlDecode(encoded));
    expect(decoded).toBe(input);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("round-trips binary bytes via String.fromCharCode", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 127, 128, 200, 255]);
    const encoded = base64UrlEncode(String.fromCharCode(...bytes));
    const decoded = base64UrlDecode(encoded);

    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
