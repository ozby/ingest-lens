import { createMiddleware } from "hono/factory";
import type { Env } from "../db/client";

export interface DecodedToken {
  userId: string;
  username: string;
}

type AuthVariables = {
  user: DecodedToken;
};

export const authenticate = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ status: "error", message: "Authentication required" }, 401);
  }

  const token = authHeader.slice(7);
  const secret = c.env.JWT_SECRET;

  if (!secret) {
    return c.json({ status: "error", message: "Server misconfiguration" }, 500);
  }

  try {
    // Use Web Crypto API (available in Workers runtime)
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) {
      return c.json({ status: "error", message: "Invalid token" }, 401);
    }

    // Verify HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signingInput = `${headerB64}.${payloadB64}`;
    const signatureBytes = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signatureBytes,
      encoder.encode(signingInput),
    );

    if (!valid) {
      return c.json({ status: "error", message: "Invalid token" }, 401);
    }

    // Decode payload
    const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadStr) as Record<string, unknown>;

    // Check expiry
    if (payload.exp && typeof payload.exp === "number") {
      if (Date.now() / 1000 > payload.exp) {
        return c.json({ status: "error", message: "Token expired" }, 401);
      }
    }

    c.set("user", {
      userId: payload.userId as string,
      username: payload.username as string,
    });

    await next();
  } catch {
    return c.json({ status: "error", message: "Invalid token" }, 401);
  }
});

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateToken(
  userId: string,
  username: string,
  secret: string,
  expiresInSeconds = 86400,
): Promise<string> {
  return (async () => {
    const encoder = new TextEncoder();
    const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64UrlEncode(
      JSON.stringify({
        userId,
        username,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
        iat: Math.floor(Date.now() / 1000),
      }),
    );

    const signingInput = `${header}.${payload}`;
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(signingInput),
    );
    const signature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    return `${header}.${payload}.${signature}`;
  })();
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const PBKDF2_PREFIX = "pbkdf2";
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BITS = 256;

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hashBytes = await derivePbkdf2Hash(password, salt, PBKDF2_ITERATIONS);

  return [
    PBKDF2_PREFIX,
    String(PBKDF2_ITERATIONS),
    encodeBytesBase64Url(salt),
    encodeBytesBase64Url(hashBytes),
  ].join("$");
}

export async function verifyPassword(
  candidatePassword: string,
  storedHash: string,
): Promise<boolean> {
  const parsedHash = parsePbkdf2Hash(storedHash);
  if (!parsedHash) {
    return false;
  }

  const candidateHash = await derivePbkdf2Hash(
    candidatePassword,
    parsedHash.salt,
    parsedHash.iterations,
  );

  return constantTimeEqual(candidateHash, parsedHash.hash);
}

async function derivePbkdf2Hash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    PBKDF2_HASH_BITS,
  );

  return new Uint8Array(derivedBits);
}

function parsePbkdf2Hash(storedHash: string): {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
} | null {
  const [prefix, iterationsValue, saltValue, hashValue, ...rest] = storedHash.split("$");

  if (prefix !== PBKDF2_PREFIX || !iterationsValue || !saltValue || !hashValue || rest.length > 0) {
    return null;
  }

  const iterations = Number.parseInt(iterationsValue, 10);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return null;
  }

  const salt = decodeBase64UrlBytes(saltValue);
  const hash = decodeBase64UrlBytes(hashValue);

  if (!salt || !hash || hash.length === 0) {
    return null;
  }

  return { iterations, salt, hash };
}

function encodeBytesBase64Url(bytes: Uint8Array): string {
  return base64UrlEncode(String.fromCharCode(...bytes));
}

function decodeBase64UrlBytes(value: string): Uint8Array | null {
  try {
    return base64UrlDecode(value);
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return mismatch === 0;
}
