import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../db/client";

/**
 * Tests for the per-env exact-origin CORS middleware strategy used in
 * apps/workers/src/index.ts. Tests run against a minimal Hono app that
 * reproduces the exact middleware wiring so the assertions are not coupled to
 * the full route tree.
 */

function buildApp(allowedOrigin: string | undefined): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", (c, next) => {
    return cors({
      origin: allowedOrigin ?? [],
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      maxAge: 300,
    })(c, next);
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}

describe("CORS middleware — exact-origin allow-listing", () => {
  describe("allowed origin", () => {
    it("returns Access-Control-Allow-Origin for the exact allowed origin", async () => {
      const app = buildApp("https://dev.ingest-lens.ozby.dev");
      const res = await app.fetch(
        new Request("http://localhost/health", {
          headers: { Origin: "https://dev.ingest-lens.ozby.dev" },
        }),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://dev.ingest-lens.ozby.dev",
      );
    });

    it("includes Access-Control-Allow-Credentials: true for allowed origin", async () => {
      const app = buildApp("https://dev.ingest-lens.ozby.dev");
      const res = await app.fetch(
        new Request("http://localhost/health", {
          headers: { Origin: "https://dev.ingest-lens.ozby.dev" },
        }),
      );

      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });
  });

  describe("disallowed origin", () => {
    it("does not return Access-Control-Allow-Origin for a forbidden origin", async () => {
      const app = buildApp("https://dev.ingest-lens.ozby.dev");
      const res = await app.fetch(
        new Request("http://localhost/health", {
          headers: { Origin: "https://evil.example.com" },
        }),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("does not set Access-Control-Allow-Origin for a forbidden origin (credentials header irrelevant to browser)", async () => {
      const app = buildApp("https://dev.ingest-lens.ozby.dev");
      const res = await app.fetch(
        new Request("http://localhost/health", {
          headers: { Origin: "https://evil.example.com" },
        }),
      );

      // Hono's cors middleware emits credentials: true unconditionally, but
      // browsers gate on Access-Control-Allow-Origin first — if that header is
      // absent (as asserted in the preceding test), the credentials header is
      // irrelevant and the cross-origin request is rejected by the browser.
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });

  describe("OPTIONS preflight", () => {
    it("responds 204 with short-lived max-age cache for allowed origin", async () => {
      const app = buildApp("https://dev.ingest-lens.ozby.dev");
      const res = await app.fetch(
        new Request("http://localhost/health", {
          method: "OPTIONS",
          headers: {
            Origin: "https://dev.ingest-lens.ozby.dev",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
          },
        }),
      );

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Max-Age")).toBe("300");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://dev.ingest-lens.ozby.dev",
      );
    });
  });

  describe("no wildcard", () => {
    it("never returns * as the Allow-Origin value", async () => {
      const app = buildApp("https://dev.ingest-lens.ozby.dev");
      const res = await app.fetch(
        new Request("http://localhost/health", {
          headers: { Origin: "https://dev.ingest-lens.ozby.dev" },
        }),
      );

      expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
    });
  });

  describe("prd environment wiring", () => {
    it("allows the prd origin when configured", async () => {
      const app = buildApp("https://ingest-lens.ozby.dev");
      const res = await app.fetch(
        new Request("http://localhost/health", {
          headers: { Origin: "https://ingest-lens.ozby.dev" },
        }),
      );

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://ingest-lens.ozby.dev");
    });

    it("blocks the dev origin when only prd is configured", async () => {
      const app = buildApp("https://ingest-lens.ozby.dev");
      const res = await app.fetch(
        new Request("http://localhost/health", {
          headers: { Origin: "https://dev.ingest-lens.ozby.dev" },
        }),
      );

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });
});
