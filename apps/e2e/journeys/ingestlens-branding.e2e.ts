import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot, runCommand } from "./command";

const clientRoot = path.join(repoRoot, "apps/client");

function readClientSource(relativePath: string): string {
  return readFileSync(path.join(clientRoot, "src", relativePath), "utf8");
}

describe("IngestLens branding proof", () => {
  it("keeps the app shell and primary routes aligned to the IngestLens story", () => {
    const navBar = readClientSource("components/NavBar.tsx");
    const sidebar = readClientSource("components/Sidebar.tsx");
    const landing = readClientSource("pages/Index.tsx");
    const dashboard = readClientSource("pages/Dashboard.tsx");
    const queues = readClientSource("pages/Queues.tsx");
    const topics = readClientSource("pages/Topics.tsx");
    const metrics = readClientSource("pages/Metrics.tsx");
    const intake = readClientSource("pages/Intake.tsx");
    const adminIntake = readClientSource("pages/AdminIntake.tsx");

    expect(navBar).toContain("IngestLens");
    expect(navBar).toContain("AI-assisted integration observability");

    expect(sidebar).toContain("INTEGRATION OBSERVABILITY");
    expect(sidebar).toContain("DELIVERY PRIMITIVES");
    expect(sidebar).toContain("Queues and topics stay visible as the shipped delivery rails.");

    expect(landing).toContain("Sign in to inspect delivery rails, monitor observability");
    expect(dashboard).toContain("IngestLens operations dashboard");
    expect(queues).toContain("Delivery Queues");
    expect(topics).toContain("Delivery Topics");
    expect(metrics).toContain("Delivery and intake metrics");
    expect(intake).toContain("Intake mapping");
    expect(adminIntake).toContain("Intake admin review");

    const staleCopyScan = runCommand("rg", [
      "-n",
      "--glob",
      "!**/*.test.tsx",
      "--glob",
      "!**/*.test.ts",
      "PubSub Dashboard|Overview of your message queuing system|Monitor the performance of your message queuing system",
      "apps/client/src",
    ]);

    expect(staleCopyScan.combinedOutput).toBe("");
  }, 120_000);
});
