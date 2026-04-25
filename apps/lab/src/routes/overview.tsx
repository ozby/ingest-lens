/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Env } from "../env";
import { Topbar } from "../views/topbar";
import { LeftRail } from "../views/left-rail";

export const overviewRoutes = new Hono<{ Bindings: Env }>();

overviewRoutes.get("/", (c) => {
  const html = (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Consistency Lab — IngestLens</title>
        <link rel="stylesheet" href="/lab/assets/lab.css" />
      </head>
      <body class="lab-body">
        <Topbar />
        <div class="lab-layout">
          <LeftRail />
          <main class="lab-main" id="lab-main">
            <h1 class="lab-main__heading">Consistency Lab</h1>
            <p class="lab-main__intro">
              Select a scenario from the left to view results and run experiments.
            </p>
            <ul class="lab-overview__list">
              <li>
                <a href="/lab/s1a-correctness" class="lab-overview__link">
                  S1a — Correctness: delivery ordering guarantees across CF Queues, PG Polling, and
                  PG Direct Notify.
                </a>
              </li>
              <li>
                <a href="/lab/s1b-latency" class="lab-overview__link">
                  S1b — Latency: end-to-end message delivery latency (p50/p99) across all three
                  paths.
                </a>
              </li>
            </ul>
          </main>
        </div>
        <script src="/lab/assets/htmx.min.js" defer />
        <script src="/lab/assets/htmx-ext-sse.js" defer />
      </body>
    </html>
  );
  return c.html(`<!DOCTYPE html>${html.toString()}`);
});
