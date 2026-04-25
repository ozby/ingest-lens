/**
 * Session-cookie middleware (F-08).
 *
 * Cookie name: lab_sid
 * Secret:      env.LAB_SESSION_SECRET — NEVER env.JWT_SECRET (F-08)
 * Attributes:  httpOnly, sameSite=strict, 1h TTL, secure in production
 *
 * On GET routes: reads and validates cookie, attaches sessionId to context.
 *   If cookie absent or invalid → passes through (SSE endpoint enforces its own 403).
 * On POST /lab/s{1a,1b}/run: issues a new signed cookie after lock+gauge acquire.
 *
 * Cookie format: <sessionId>.<hmac-sha256-hex>
 * HMAC is computed over sessionId using LAB_SESSION_SECRET.
 */
import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "../env";

export const SESSION_COOKIE_NAME = "lab_sid";
const COOKIE_TTL_SECONDS = 3600; // 1 hour

/**
 * Compute HMAC-SHA256 signature over the given data with the given secret.
 * Uses the Web Crypto API available in Workers.
 */
async function sign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", keyMaterial, enc.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify HMAC-SHA256 signature.
 * Constant-time compare via timingSafeEqual not available in Workers; we
 * use SubtleCrypto verify which is constant-time inside the engine.
 */
async function verify(data: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = new Uint8Array(signature.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.verify("HMAC", keyMaterial, sigBytes, enc.encode(data));
}

/** Build a signed cookie value from a sessionId. */
export async function buildCookieValue(sessionId: string, secret: string): Promise<string> {
  const sig = await sign(sessionId, secret);
  return `${sessionId}.${sig}`;
}

/**
 * Parse and verify a cookie value.
 * Returns the sessionId on success, null on failure.
 */
export async function parseCookieValue(value: string, secret: string): Promise<string | null> {
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const sessionId = value.slice(0, dotIdx);
  const sig = value.slice(dotIdx + 1);
  const ok = await verify(sessionId, sig, secret);
  return ok ? sessionId : null;
}

/** Generate a new sessionId (UUID v4). */
export function newSessionId(): string {
  return crypto.randomUUID();
}

/** Set the lab_sid cookie on a response. */
export function setSessionCookie(c: Context<{ Bindings: Env }>, cookieValue: string): void {
  const isProd = c.env.NODE_ENV === "production";
  setCookie(c, SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "Strict",
    secure: isProd,
    maxAge: COOKIE_TTL_SECONDS,
    path: "/lab",
  });
}

/**
 * Read and validate the session cookie from the incoming request.
 * Returns the sessionId if valid, null otherwise.
 */
export async function readSessionCookie(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const raw = getCookie(c, SESSION_COOKIE_NAME);
  if (!raw) return null;
  return parseCookieValue(raw, c.env.LAB_SESSION_SECRET);
}

/**
 * Session-cookie middleware: reads cookie, attaches sessionId to context variable.
 * Passes through even if cookie is absent — individual routes enforce auth.
 */
export async function sessionCookieMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const sessionId = await readSessionCookie(c);
  c.set("sessionId" as never, sessionId);
  return next();
}
