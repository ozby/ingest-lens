/**
 * Run endpoints — POST /lab/s1a/run and POST /lab/s1b/run (Task 4.4).
 *
 * CRITICAL acquire order (F-02):
 *  1. SESSION_LOCK.acquire(sessionId) → if held, return waiting-room partial (NO gauge consumed)
 *  2. CONCURRENCY_GAUGE.acquire(sessionId) → if over cap, release lock then return 429
 *  3. S1*_RUNNER.start({sessionId, ...}) → DO alarm chain drives the run
 *  4. Return 200 with cookie + streaming URL
 *
 * The shell does NOT waitUntil for the full run — the DO is the long-running entity (F-04).
 */
import { Hono } from "hono";
import type { Env } from "../env";
import {
  buildCookieValue,
  newSessionId,
  setSessionCookie,
  SESSION_COOKIE_NAME,
  parseCookieValue,
} from "../middleware/session-cookie";

export const runRoutes = new Hono<{ Bindings: Env }>();

const DEFAULT_WORKLOAD_SIZE = 1000;

/**
 * Verify the incoming Authorization: Bearer <token> header against the
 * LAB_RUN_TOKEN env var using a timing-safe comparison (FIX-4 / CSO audit).
 *
 * Returns true when the token is valid, false otherwise.
 */
/**
 * Constant-time string comparison to prevent timing attacks (FIX-4 / CSO audit).
 * crypto.subtle.timingSafeEqual is Cloudflare-only; fall back to a manual
 * bitwise XOR loop so the function also works in Vitest (Node.js) environments.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Try the CF Workers built-in first; fall back to manual XOR
  if (typeof (crypto.subtle as unknown as Record<string, unknown>).timingSafeEqual === "function") {
    if (a.byteLength !== b.byteLength) return false;
    return (
      crypto.subtle as unknown as {
        timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean;
      }
    ).timingSafeEqual(a, b);
  }
  // Manual constant-time XOR (safe fallback)
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

function verifyRunToken(request: Request, expectedToken: string): boolean {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const incoming = authHeader.slice("Bearer ".length);

  const encoder = new TextEncoder();
  return constantTimeEqual(encoder.encode(incoming), encoder.encode(expectedToken));
}

async function getOrCreateSessionId(c: { env: Env; req: { raw: Request } }): Promise<string> {
  // Try to read existing cookie
  const raw = c.req.raw.headers.get("cookie") ?? "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (match) {
    const parsed = await parseCookieValue(match[1] ?? "", c.env.LAB_SESSION_SECRET);
    if (parsed !== null) return parsed;
  }
  return newSessionId();
}

/** Call SESSION_LOCK.acquire via DO fetch. */
async function acquireLock(
  ns: DurableObjectNamespace,
  sessionId: string,
): Promise<{ granted: boolean; position?: number; etaMs?: number }> {
  const id = ns.idFromName("lab-session-lock");
  const stub = ns.get(id);
  const res = await stub.fetch("https://do/acquire", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
    headers: { "Content-Type": "application/json" },
  });
  return res.json<{ granted: boolean; position?: number; etaMs?: number }>();
}

/** Call SESSION_LOCK.release via DO fetch. */
async function releaseLock(ns: DurableObjectNamespace, sessionId: string): Promise<void> {
  const id = ns.idFromName("lab-session-lock");
  const stub = ns.get(id);
  await stub.fetch("https://do/release", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
    headers: { "Content-Type": "application/json" },
  });
}

/** Call CONCURRENCY_GAUGE.acquire via DO fetch. */
async function acquireGauge(
  ns: DurableObjectNamespace,
  sessionId: string,
): Promise<{ granted: boolean; activeCount: number; retryAfter?: number }> {
  const id = ns.idFromName("lab-concurrency-gauge");
  const stub = ns.get(id);
  const res = await stub.fetch("https://do/acquire", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
    headers: { "Content-Type": "application/json" },
  });
  return res.json<{ granted: boolean; activeCount: number; retryAfter?: number }>();
}

/** Call S1aRunnerDO.start via DO fetch. */
async function startS1aRunner(ns: DurableObjectNamespace, sessionId: string): Promise<void> {
  const id = ns.idFromName(`s1a-runner-${sessionId}`);
  const stub = ns.get(id);
  await stub.fetch("https://do/start", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      workloadSize: DEFAULT_WORKLOAD_SIZE,
      seed: "s1a-default",
      mode: "sequential",
    }),
    headers: { "Content-Type": "application/json" },
  });
}

/** Call S1bRunnerDO.start via DO fetch. */
async function startS1bRunner(ns: DurableObjectNamespace, sessionId: string): Promise<void> {
  const id = ns.idFromName(`s1b-runner-${sessionId}`);
  const stub = ns.get(id);
  await stub.fetch("https://do/start", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      mode: "sequential",
      messageCount: DEFAULT_WORKLOAD_SIZE,
    }),
    headers: { "Content-Type": "application/json" },
  });
}

// ─── POST /lab/s1a/run ────────────────────────────────────────────────────────

runRoutes.post("/s1a/run", async (c) => {
  if (!verifyRunToken(c.req.raw, c.env.LAB_RUN_TOKEN)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const sessionId = await getOrCreateSessionId({ env: c.env, req: { raw: c.req.raw } });

  // Step 1: acquire SESSION_LOCK first (F-02)
  const lockResult = await acquireLock(c.env.SESSION_LOCK, sessionId);
  if (!lockResult.granted) {
    const etaMs = lockResult.etaMs ?? 0;
    const position = lockResult.position ?? 1;
    // Return waiting-room partial — gauge NOT consumed (F-02)
    const html = `<div class="lab-waiting-room" role="status" aria-live="polite">
<h2>Run in progress</h2>
<p>You are position <strong>${position}</strong> in the queue.</p>
<p>Estimated wait: ~${Math.ceil(etaMs / 1000)}s</p>
</div>`;
    return c.html(html, 200);
  }

  // Step 2: acquire CONCURRENCY_GAUGE (F-02 — only after lock granted)
  const gaugeResult = await acquireGauge(c.env.CONCURRENCY_GAUGE, sessionId);
  if (!gaugeResult.granted) {
    // Release lock before returning 429 (F-02)
    await releaseLock(c.env.SESSION_LOCK, sessionId);
    return c.json(
      {
        error: "capacity_exceeded",
        retryAfter: gaugeResult.retryAfter ?? 5000,
        activeCount: gaugeResult.activeCount,
      },
      429,
    );
  }

  // Step 3: start the runner DO (F-04 — DO alarms drive the run, no waitUntil needed)
  await startS1aRunner(c.env.S1A_RUNNER, sessionId);

  // Step 4: issue cookie + return streaming URL
  const cookieValue = await buildCookieValue(sessionId, c.env.LAB_SESSION_SECRET);
  setSessionCookie(c, cookieValue);

  return c.json({
    ok: true,
    sessionId,
    streamUrl: `/lab/sessions/${sessionId}/stream`,
  });
});

// ─── POST /lab/s1b/run ────────────────────────────────────────────────────────

runRoutes.post("/s1b/run", async (c) => {
  if (!verifyRunToken(c.req.raw, c.env.LAB_RUN_TOKEN)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const sessionId = await getOrCreateSessionId({ env: c.env, req: { raw: c.req.raw } });

  // Step 1: acquire SESSION_LOCK first (F-02)
  const lockResult = await acquireLock(c.env.SESSION_LOCK, sessionId);
  if (!lockResult.granted) {
    const etaMs = lockResult.etaMs ?? 0;
    const position = lockResult.position ?? 1;
    const html = `<div class="lab-waiting-room" role="status" aria-live="polite">
<h2>Run in progress</h2>
<p>You are position <strong>${position}</strong> in the queue.</p>
<p>Estimated wait: ~${Math.ceil(etaMs / 1000)}s</p>
</div>`;
    return c.html(html, 200);
  }

  // Step 2: acquire CONCURRENCY_GAUGE (F-02)
  const gaugeResult = await acquireGauge(c.env.CONCURRENCY_GAUGE, sessionId);
  if (!gaugeResult.granted) {
    await releaseLock(c.env.SESSION_LOCK, sessionId);
    return c.json(
      {
        error: "capacity_exceeded",
        retryAfter: gaugeResult.retryAfter ?? 5000,
        activeCount: gaugeResult.activeCount,
      },
      429,
    );
  }

  // Step 3: start the runner DO
  await startS1bRunner(c.env.S1B_RUNNER, sessionId);

  // Step 4: issue cookie + return streaming URL
  const cookieValue = await buildCookieValue(sessionId, c.env.LAB_SESSION_SECRET);
  setSessionCookie(c, cookieValue);

  return c.json({
    ok: true,
    sessionId,
    streamUrl: `/lab/sessions/${sessionId}/stream`,
  });
});
