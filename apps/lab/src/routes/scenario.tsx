/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Env } from "../env";
import { Topbar } from "../views/topbar";
import { LeftRail } from "../views/left-rail";
import { EmptyState } from "../views/empty-state";
import { ResultTable } from "../views/result-table";

export type ScenarioId = "s1a" | "s1b";

interface ScenarioConfig {
  id: ScenarioId;
  label: string;
  runEndpoint: string;
  paths: Array<{ pathId: string; pathLabel: string }>;
}

const SCENARIO_CONFIGS: Record<string, ScenarioConfig> = {
  "s1a-correctness": {
    id: "s1a",
    label: "S1a — Correctness",
    runEndpoint: "/lab/s1a/run",
    paths: [
      { pathId: "cf-queues", pathLabel: "CF Queues" },
      { pathId: "pg-polling", pathLabel: "PG Polling" },
      { pathId: "pg-direct-notify", pathLabel: "PG Direct Notify" },
    ],
  },
  "s1b-latency": {
    id: "s1b",
    label: "S1b — Latency",
    runEndpoint: "/lab/s1b/run",
    paths: [
      { pathId: "cf-queues-latency", pathLabel: "CF Queues" },
      { pathId: "pg-polling-latency", pathLabel: "PG Polling" },
      { pathId: "pg-direct-notify-latency", pathLabel: "PG Direct Notify" },
    ],
  },
};

export const scenarioRoutes = new Hono<{ Bindings: Env }>();

scenarioRoutes.get("/:slug", (c) => {
  const slug = c.req.param("slug");
  const config = SCENARIO_CONFIGS[slug];
  if (config === undefined) {
    return c.text("Not Found", 404);
  }

  // Session ID comes from context (set by session-cookie middleware), or empty for initial render
  const sessionId = (c.get("sessionId" as never) as string | null) ?? "";
  const hasSession = sessionId.length > 0;

  const rows = config.paths.map((p) => ({
    ...p,
    status: "pending" as const,
  }));

  const html = (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{config.label} — Consistency Lab</title>
        <link rel="stylesheet" href="/lab/assets/lab.css" />
      </head>
      <body class="lab-body">
        <Topbar />
        <div class="lab-layout">
          <LeftRail activeScenarioId={config.id} />
          <main class="lab-main" id="lab-main">
            <nav class="lab-breadcrumb" aria-label="Breadcrumb">
              <ol class="lab-breadcrumb__list">
                <li>
                  <a href="/lab" class="lab-breadcrumb__link">
                    Lab
                  </a>
                </li>
                <li aria-current="page">{config.label}</li>
              </ol>
            </nav>
            <h1 class="lab-main__heading">{config.label}</h1>
            <form
              method="post"
              action={config.runEndpoint}
              class="lab-run-form"
              aria-label="Start scenario run"
            >
              <button type="submit" class="lab-btn lab-btn--primary">
                Run
              </button>
            </form>
            <section class="lab-results" aria-label="Results">
              {hasSession ? (
                <ResultTable scenarioId={config.id} sessionId={sessionId} rows={rows} />
              ) : (
                <EmptyState scenarioLabel={config.label} />
              )}
            </section>
          </main>
        </div>
        <script src="/lab/assets/htmx.min.js" defer />
        <script src="/lab/assets/htmx-ext-sse.js" defer />
      </body>
    </html>
  );

  return c.html(`<!DOCTYPE html>${html.toString()}`);
});
