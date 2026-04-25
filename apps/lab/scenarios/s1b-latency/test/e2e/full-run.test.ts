/**
 * s1b-latency E2E suite — Task 3.7
 *
 * Auto-skips with SKIP_REASON=shell-not-wired until Lane D (HTTP shell) ships.
 * When the shell is wired, set E2E_S1B_BASE_URL to enable the test.
 */
import { describe, it, expect } from "vitest";

const isWired = process.env["E2E_S1B_BASE_URL"] !== undefined;

describe.skipIf(!isWired)("s1b-latency full-run E2E", () => {
  it("POST /lab/s1b/run returns a latency summary with three paths", async () => {
    const baseUrl = process.env["E2E_S1B_BASE_URL"]!;
    const res = await fetch(`${baseUrl}/lab/s1b/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageCount: 100, mode: "sequential" }),
    });

    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      summaries: Array<{
        pathId: string;
        p50Ms: number | null;
        p99Ms: number | null;
        status: string;
      }>;
    };

    expect(body.summaries).toHaveLength(3);

    for (const summary of body.summaries) {
      expect(["cf-queues-latency", "pg-polling-latency", "pg-direct-notify-latency"]).toContain(
        summary.pathId,
      );
      expect(["OK", "PARTIAL", "FAILED"]).toContain(summary.status);
    }
  });

  it("three seeded sequential runs produce summaries within ±15% of each other", async () => {
    const baseUrl = process.env["E2E_S1B_BASE_URL"]!;

    const runOnce = async () => {
      const res = await fetch(`${baseUrl}/lab/s1b/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageCount: 100, mode: "sequential" }),
      });
      const body = (await res.json()) as {
        summaries: Array<{ pathId: string; p99Ms: number | null }>;
      };
      return body.summaries;
    };

    const [run1, run2, run3] = await Promise.all([runOnce(), runOnce(), runOnce()]);

    for (const pathId of ["cf-queues-latency", "pg-polling-latency", "pg-direct-notify-latency"]) {
      const p99s = [run1, run2, run3]
        .map((r) => r.find((s) => s.pathId === pathId)?.p99Ms)
        .filter((v): v is number => v !== null && v !== undefined);

      if (p99s.length < 2) continue;

      const max = Math.max(...p99s);
      const min = Math.min(...p99s);
      const variance = min > 0 ? (max - min) / min : 0;
      // ±15% reproducibility requirement
      expect(variance).toBeLessThanOrEqual(0.15);
    }
  });
});
