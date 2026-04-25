/**
 * s1a-correctness end-to-end test.
 *
 * Exercises the full three-path run via the shell API (Lane D).
 * Skipped until Lane D's shell is wired (`SKIP_REASON=shell-not-wired`).
 *
 * When Lane D ships, set E2E_BASE_URL=<worker-url> and remove the skip.
 */
import { describe, it, expect } from "vitest";

const SKIP_REASON = process.env["SKIP_REASON"] ?? "shell-not-wired";
const BASE_URL = process.env["E2E_BASE_URL"];
const SKIP = !BASE_URL || SKIP_REASON === "shell-not-wired";

describe.skipIf(SKIP)("s1a-correctness e2e — full three-path run", () => {
  it("runs all three paths and returns a summary", async () => {
    const res = await fetch(`${BASE_URL}/lab/s1a/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workloadSize: 100,
        seed: "e2e-seed",
        mode: "sequential",
      }),
    });

    expect(res.ok).toBe(true);

    const body = (await res.json()) as {
      sessionId: string;
      summary: {
        overallStatus: string;
        paths: Array<{ pathId: string; status: string }>;
      };
    };

    expect(body.sessionId).toBeTruthy();
    expect(body.summary.overallStatus).toMatch(/^(OK|PARTIAL|FAILED)$/);
    expect(body.summary.paths).toHaveLength(3);

    const pathIds = body.summary.paths.map((p) => p.pathId);
    expect(pathIds).toContain("cf-queues");
    expect(pathIds).toContain("pg-polling");
    expect(pathIds).toContain("pg-direct-notify");
  });
});

describe("s1a-correctness e2e — skip guard", () => {
  it("is skipped until Lane D shell is wired", () => {
    if (SKIP) {
      expect(SKIP_REASON).toBe("shell-not-wired");
    } else {
      // Lane D is wired — this branch never runs in skip mode
      expect(BASE_URL).toBeTruthy();
    }
  });
});
