import { createMiddleware } from "hono/factory";
import { base64UrlDecode } from "../auth/crypto";
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
