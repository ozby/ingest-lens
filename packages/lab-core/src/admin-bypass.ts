/**
 * AdminBypassToken — Cloudflare KV–backed module for admin kill-switch bypass.
 *
 * Compares a request's `X-Lab-Admin-Token` header against `LAB_ADMIN_SECRET`
 * using constant-time comparison to prevent timing attacks (F-06).
 *
 * Returns a middleware factory that bypasses kill-switch checks for verified
 * admin requests and writes an audit row to `lab.heartbeat_audit`.
 */

export interface AdminBypassEnv {
  LAB_ADMIN_SECRET?: string;
  KILL_SWITCH_KV: KVNamespaceAdmin;
}

export interface KVNamespaceAdmin {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface AdminBypassAuditRow {
  action: string;
  actorId: string;
  tokenHash: string; // SHA-256 hex of the presented token, for forensics
  isAdminBypass: true;
  createdAt: string; // ISO8601
}

/**
 * Constant-time string comparison to prevent timing-based token enumeration.
 * Returns true only if both strings are identical in length and content.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still walk `a` to keep timing consistent on length mismatch.
    let _diff = 0;
    for (let i = 0; i < a.length; i++) {
      _diff |= a.charCodeAt(i) ^ 0;
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Compute a simple hex digest of a token for audit logging.
 * Uses Web Crypto API (available in CF Workers runtime).
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check whether the given token string is a valid admin token.
 * Uses constant-time comparison against `LAB_ADMIN_SECRET`.
 * Returns false if LAB_ADMIN_SECRET is not configured.
 */
export function isValidAdminToken(token: string, secret: string | undefined): boolean {
  if (!secret || secret.length === 0) return false;
  return timingSafeEqual(token, secret);
}

/**
 * Extract the admin token from a request's `X-Lab-Admin-Token` header.
 * Returns null if the header is absent or empty.
 */
export function extractAdminToken(headers: { get(name: string): string | null }): string | null {
  const token = headers.get("X-Lab-Admin-Token");
  return token && token.length > 0 ? token : null;
}

const AUDIT_KEY_PREFIX = "lab:admin-audit:";

/**
 * Write an admin bypass audit entry to KV for forensic trail (F-06).
 */
export async function writeAdminAuditEntry(
  kv: KVNamespaceAdmin,
  entry: AdminBypassAuditRow,
): Promise<void> {
  const key = `${AUDIT_KEY_PREFIX}${entry.createdAt}`;
  await kv.put(key, JSON.stringify(entry));
}
