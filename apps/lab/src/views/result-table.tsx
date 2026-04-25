/** @jsxImportSource hono/jsx */

/**
 * ResultTable — HTMX SSE-wired result table (Task 4.7).
 *
 * HTMX SSE extension wiring:
 *  - hx-ext="sse" on the container
 *  - sse-connect="/lab/sessions/{sessionId}/stream"
 *  - sse-swap per event type targeting stable cell ids
 *
 * Stable cell ids follow pattern:
 *   <scenarioId>-<pathSlug>-<metric>
 *   e.g. "s1a-path-cf-queues-inversions"
 *
 * prefers-reduced-motion: CSS disables the cell-populate transition.
 */

interface PathRow {
  pathId: string;
  pathLabel: string;
  delivered?: number;
  inversions?: number;
  p50?: number;
  p99?: number;
  status: "pending" | "running" | "completed" | "failed";
  failureReason?: string;
}

interface ResultTableProps {
  scenarioId: string;
  sessionId: string;
  rows: PathRow[];
}

function pathSlug(pathId: string): string {
  return pathId.replace(/_/g, "-").toLowerCase();
}

export function ResultTable({ scenarioId, sessionId, rows }: ResultTableProps) {
  const streamUrl = `/lab/sessions/${sessionId}/stream`;
  return (
    <div
      id={`${scenarioId}-result-table`}
      class="lab-result-table-container"
      hx-ext="sse"
      sse-connect={streamUrl}
      aria-label="Scenario run results"
      aria-live="polite"
    >
      <table class="lab-result-table" role="table">
        <caption class="lab-result-table__caption">Live delivery path results</caption>
        <thead>
          <tr>
            <th scope="col" class="lab-result-table__th">
              Path
            </th>
            <th scope="col" class="lab-result-table__th">
              Delivered
            </th>
            <th scope="col" class="lab-result-table__th">
              Inversions
            </th>
            <th scope="col" class="lab-result-table__th">
              p50 (ms)
            </th>
            <th scope="col" class="lab-result-table__th">
              p99 (ms)
            </th>
            <th scope="col" class="lab-result-table__th">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const slug = pathSlug(row.pathId);
            return (
              <tr
                key={row.pathId}
                class={`lab-result-table__row lab-result-table__row--${row.status}`}
              >
                <td class="lab-result-table__td">{row.pathLabel}</td>
                <td
                  class="lab-result-table__td lab-result-table__td--number"
                  id={`${scenarioId}-path-${slug}-delivered`}
                  sse-swap="message_delivered"
                >
                  {row.delivered ?? "—"}
                </td>
                <td
                  class="lab-result-table__td lab-result-table__td--number"
                  id={`${scenarioId}-path-${slug}-inversions`}
                  sse-swap="path_completed"
                >
                  {row.inversions ?? "—"}
                </td>
                <td
                  class="lab-result-table__td lab-result-table__td--number"
                  id={`${scenarioId}-path-${slug}-p50`}
                  sse-swap="path_completed"
                >
                  {row.p50 ?? "—"}
                </td>
                <td
                  class="lab-result-table__td lab-result-table__td--number"
                  id={`${scenarioId}-path-${slug}-p99`}
                  sse-swap="path_completed"
                >
                  {row.p99 ?? "—"}
                </td>
                <td
                  class="lab-result-table__td"
                  id={`${scenarioId}-path-${slug}-status`}
                  sse-swap="run_completed"
                >
                  <span class={`lab-status lab-status--${row.status}`}>{row.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
