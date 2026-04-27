import { createMiddleware } from "hono/factory";
import { base64UrlDecode } from "../auth/crypto";
import type { Env } from "../db/client";

async function isJtiRevoked(
  kv: { get(key: string): Promise<string | null> } | undefined | null,
  jti: string | undefined,
): Promise<boolean> {
  if (!jti || !kv) return false;
  const revoked = await kv.get(`revoked:${jti}`);
  return revoked !== null;
}

export interface DecodedToken {
  jti: string;
  userId: string;
  username: string;
}

export type AuthVariables = {
  user: DecodedToken;
};

async function verifyJwtSignature(
  token: string,
  secret: string,
): Promise<{ ok: false } | { ok: true; headerB64: string; payloadB64: string }> {
  const [headerB64, payloadB64, signatureB64] = token.split(".") as [
    string | undefined,
    string | undefined,
    string | undefined,
  ];
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return { ok: false };
  }

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

  if (!valid) return { ok: false };
  return { ok: true, headerB64, payloadB64 };
}

function isTokenExpired(payload: Record<string, unknown>): boolean {
  if (payload.exp && typeof payload.exp === "number") {
    return Date.now() / 1000 > payload.exp;
  }
  return false;
}

async function validatePayload(
  payloadB64: string,
  kv: { get(key: string): Promise<string | null> } | undefined | null,
): Promise<
  { ok: false; reason: string } | { ok: true; jti: string; userId: string; username: string }
> {
  const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
  const payload = JSON.parse(payloadStr) as Record<string, unknown>;

  if (isTokenExpired(payload)) {
    return { ok: false, reason: "Token expired" };
  }

  const jti = payload.jti as string | undefined;
  if (await isJtiRevoked(kv, jti)) {
    return { ok: false, reason: "Token has been revoked" };
  }

  return {
    ok: true,
    jti: jti ?? "",
    userId: payload.userId as string,
    username: payload.username as string,
  };
}

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
    const verified = await verifyJwtSignature(token, secret);
    if (!verified.ok) {
      return c.json({ status: "error", message: "Invalid token" }, 401);
    }

    const result = await validatePayload(verified.payloadB64, c.env.KV);
    if (!result.ok) {
      return c.json({ status: "error", message: result.reason }, 401);
    }

    c.set("user", { jti: result.jti, userId: result.userId, username: result.username });
    await next();
  } catch {
    return c.json({ status: "error", message: "Invalid token" }, 401);
  }
});
