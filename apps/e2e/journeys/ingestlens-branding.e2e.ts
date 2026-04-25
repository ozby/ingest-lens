import { describe, expect, it } from "vitest";
import path from "node:path";
import { repoRoot, runCommand } from "./command";

const clientRoot = path.join(repoRoot, "apps/client");

describe("IngestLens branding proof", () => {
  it("keeps the app shell and primary routes aligned to the IngestLens story", () => {
    const clientRouteProof = runCommand(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "src/App.test.tsx",
        "src/components/brandingShell.test.tsx",
        "src/pages/landingDashboardCopy.test.tsx",
        "src/pages/deliveryRailsCopy.test.tsx",
        "src/pages/metricsBrandingCopy.test.tsx",
      ],
      { cwd: clientRoot },
    );

    expect(clientRouteProof.status).toBe(0);

    const staleCopyScan = runCommand("rg", [
      "-n",
      "--glob",
      "!**/*.test.tsx",
      "--glob",
      "!**/*.test.ts",
      "PubSub Dashboard|Overview of your message queuing system|Monitor the performance of your message queuing system",
      "apps/client/src",
    ]);

    expect(staleCopyScan.status).toBe(1);
  }, 120_000);
});
