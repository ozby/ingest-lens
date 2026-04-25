import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { scenarioRoutes } from "./scenario";
import type { Env } from "../env";

function makeApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/lab", scenarioRoutes);
  return app;
}

describe("scenarioRoutes", () => {
  it("GET /lab/s1a-correctness returns 200 with wordmark", async () => {
    const app = makeApp();
    const res = await app.request("http://localhost/lab/s1a-correctness");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Consistency Lab");
  });

  it("GET /lab/s1a-correctness includes S1a breadcrumb", async () => {
    const app = makeApp();
    const res = await app.request("http://localhost/lab/s1a-correctness");
    const html = await res.text();
    expect(html).toContain("S1a — Correctness");
  });

  it("GET /lab/s1b-latency returns 200 with wordmark", async () => {
    const app = makeApp();
    const res = await app.request("http://localhost/lab/s1b-latency");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Consistency Lab");
  });

  it("GET /lab/s1b-latency includes S1b breadcrumb", async () => {
    const app = makeApp();
    const res = await app.request("http://localhost/lab/s1b-latency");
    const html = await res.text();
    expect(html).toContain("S1b — Latency");
  });

  it("GET /lab/unknown returns 404", async () => {
    const app = makeApp();
    const res = await app.request("http://localhost/lab/unknown-scenario");
    expect(res.status).toBe(404);
  });

  it("shows empty state when no session", async () => {
    const app = makeApp();
    const res = await app.request("http://localhost/lab/s1a-correctness");
    const html = await res.text();
    expect(html).toContain("No runs recorded yet");
  });

  it("includes topbar and left-rail on scenario page", async () => {
    const app = makeApp();
    const res = await app.request("http://localhost/lab/s1a-correctness");
    const html = await res.text();
    // topbar
    expect(html).toContain("lab-topbar");
    // left rail
    expect(html).toContain("lab-left-rail");
  });

  it("includes a run form with correct action", async () => {
    const app = makeApp();
    const res = await app.request("http://localhost/lab/s1a-correctness");
    const html = await res.text();
    expect(html).toContain('action="/lab/s1a/run"');
  });
});
