/**
 * SSE stream endpoint — GET /lab/sessions/:id/stream (Task 4.5).
 *
 * Design (F-05, F-09):
 * - On reconnect with Last-Event-ID, replays from lab.events_archive (NOT ring buffer)
 * - Keepalive comment frame every 15s to defeat Workers 100s idle timeout (F-09)
 * - Cookie verification: 403 if missing or signed with wrong secret
 * - Session ID that doesn't exist → 404
 * - Stream closes on run_completed event
 *
 * Events are sanitized before emit (@repo/lab-core sanitizer).
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { parseCookieValue, SESSION_COOKIE_NAME } from "../middleware/session-cookie";
import { sanitize, type InMemoryArchive } from "@repo/lab-core";

export const streamRoutes = new Hono<{ Bindings: Env }>();

const KEEPALIVE_INTERVAL_MS = 15_000; // 15s (F-09)

/**
 * Get session cookie from request headers.
 */
function getLabSessionCookie(req: Request): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

streamRoutes.get("/sessions/:id/stream", async (c) => {
  const sessionId = c.req.param("id");
  const req = c.req.raw;

  // Verify session cookie (F-08)
  const rawCookie = getLabSessionCookie(req);
  if (!rawCookie) {
    return c.text("Forbidden", 403);
  }
  const cookieSessionId = await parseCookieValue(rawCookie, c.env.LAB_SESSION_SECRET);
  if (cookieSessionId === null) {
    return c.text("Forbidden", 403);
  }
  if (cookieSessionId !== sessionId) {
    return c.text("Forbidden", 403);
  }

  // Verify session exists — check runner DO for status
  const runnerNs = c.env.S1A_RUNNER;
  const runnerId = runnerNs.idFromName(`s1a-runner-${sessionId}`);
  const runnerStub = runnerNs.get(runnerId);
  const statusRes = await runnerStub.fetch(`https://do/status`);
  if (!statusRes.ok) {
    return c.text("Not Found", 404);
  }
  const statusBody = await statusRes.json<{
    state: { phase?: string } | null;
    events: unknown[];
  }>();
  if (statusBody.state === null) {
    return c.text("Not Found", 404);
  }

  // SSE stream
  const lastEventId = req.headers.get("Last-Event-ID") ?? "";

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const write = async (chunk: string): Promise<void> => {
    await writer.write(enc.encode(chunk));
  };

  // Archive-backed replay on reconnect (F-05)
  // The archive is injected via the route context; for the real impl, it reads from lab.events_archive via Hyperdrive.
  // Here we use the InMemoryArchive stored in the archive binding if available.
  const archive = (c as { get(key: string): unknown }).get("archive") as InMemoryArchive | null;

  void (async () => {
    try {
      // Replay missed events from archive (F-05)
      if (lastEventId && archive) {
        const rows = await archive.queryFrom(sessionId, lastEventId);
        for (const row of rows) {
          const event = JSON.parse(row.payload) as { type: string; eventId: string };
          const sanitized = sanitize(event as Parameters<typeof sanitize>[0]);
          await write(
            `id: ${row.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(sanitized)}\n\n`,
          );
        }
      }

      // Keepalive pump — runs until the stream closes
      const keepaliveHandle = setInterval(() => {
        void write(`: keepalive\n\n`);
      }, KEEPALIVE_INTERVAL_MS);

      // Poll runner DO for live events
      let closed = false;
      while (!closed) {
        const pollRes = await runnerStub.fetch("https://do/status");
        if (!pollRes.ok) break;
        const pollBody = await pollRes.json<{
          state: { phase?: string } | null;
          events: Array<{ type: string; eventId: string }>;
        }>();

        if (pollBody.state === null) break;

        const phase = pollBody.state.phase;
        if (phase === "completed" || phase === "aborted") {
          // Emit run_completed then close
          const completedEvent = pollBody.events.findLast?.((e) => e.type === "run_completed");
          if (completedEvent) {
            const sanitized = sanitize(completedEvent as Parameters<typeof sanitize>[0]);
            await write(
              `id: ${completedEvent.eventId}\nevent: run_completed\ndata: ${JSON.stringify(sanitized)}\n\n`,
            );
          }
          closed = true;
          break;
        }

        // Small sleep between polls (50ms) to avoid busy-loop
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }

      clearInterval(keepaliveHandle);
      await writer.close();
    } catch {
      await writer.abort();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
