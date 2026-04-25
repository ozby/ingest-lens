import { describe, it, expect } from "vitest";
import { renderToString } from "hono/jsx/dom/server";
import { createElement } from "hono/jsx";
import { ResultTable } from "./result-table";

const SCENARIO_ID = "s1a";
const SESSION_ID = "test-session-123";
const BASE_ROWS = [
  {
    pathId: "cf-queues",
    pathLabel: "CF Queues",
    status: "pending" as const,
  },
  {
    pathId: "pg-polling",
    pathLabel: "PG Polling",
    status: "running" as const,
    delivered: 500,
    inversions: 2,
  },
];

describe("ResultTable", () => {
  it("includes hx-ext='sse' on the container", async () => {
    const html = await renderToString(
      createElement(ResultTable, {
        scenarioId: SCENARIO_ID,
        sessionId: SESSION_ID,
        rows: BASE_ROWS,
      }),
    );
    expect(html).toContain('hx-ext="sse"');
  });

  it("includes correct sse-connect URL", async () => {
    const html = await renderToString(
      createElement(ResultTable, {
        scenarioId: SCENARIO_ID,
        sessionId: SESSION_ID,
        rows: BASE_ROWS,
      }),
    );
    expect(html).toContain(`sse-connect="/lab/sessions/${SESSION_ID}/stream"`);
  });

  it("includes sse-swap attributes for message_delivered, path_completed, run_completed", async () => {
    const html = await renderToString(
      createElement(ResultTable, {
        scenarioId: SCENARIO_ID,
        sessionId: SESSION_ID,
        rows: BASE_ROWS,
      }),
    );
    expect(html).toContain('sse-swap="message_delivered"');
    expect(html).toContain('sse-swap="path_completed"');
    expect(html).toContain('sse-swap="run_completed"');
  });

  it("generates stable cell ids with scenarioId-path-slug-metric pattern", async () => {
    const html = await renderToString(
      createElement(ResultTable, {
        scenarioId: "s1a",
        sessionId: SESSION_ID,
        rows: BASE_ROWS,
      }),
    );
    expect(html).toContain('id="s1a-path-cf-queues-delivered"');
    expect(html).toContain('id="s1a-path-cf-queues-inversions"');
    expect(html).toContain('id="s1a-path-cf-queues-p50"');
    expect(html).toContain('id="s1a-path-cf-queues-p99"');
    expect(html).toContain('id="s1a-path-cf-queues-status"');
  });

  it("renders path labels in table rows", async () => {
    const html = await renderToString(
      createElement(ResultTable, {
        scenarioId: SCENARIO_ID,
        sessionId: SESSION_ID,
        rows: BASE_ROWS,
      }),
    );
    expect(html).toContain("CF Queues");
    expect(html).toContain("PG Polling");
  });

  it("renders delivered count when provided", async () => {
    const html = await renderToString(
      createElement(ResultTable, {
        scenarioId: SCENARIO_ID,
        sessionId: SESSION_ID,
        rows: BASE_ROWS,
      }),
    );
    expect(html).toContain("500");
  });

  it("renders em-dash for missing metrics", async () => {
    const html = await renderToString(
      createElement(ResultTable, {
        scenarioId: SCENARIO_ID,
        sessionId: SESSION_ID,
        rows: [{ pathId: "cf-queues", pathLabel: "CF Queues", status: "pending" as const }],
      }),
    );
    expect(html).toContain("—");
  });
});
