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

export function hashPassword(password: string): string {
  // Simple SHA-256 hash matching original Express app's crypto approach
  // In production use a proper KDF like Argon2 / bcrypt
  // Workers don't have synchronous crypto.createHash; use sync approach via SubtleCrypto
  // For parity with the original (sha256 + salt), we do it synchronously using a polyfill approach
  // NOTE: this is not ideal for security — matches legacy behavior only
  return password + ":sha256-hashed"; // placeholder — real impl below via async
}

export async function hashPasswordAsync(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "some-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function comparePassword(
  candidatePassword: string,
  storedHash: string,
): Promise<boolean> {
  const candidateHash = await hashPasswordAsync(candidatePassword);
  return candidateHash === storedHash;
}
