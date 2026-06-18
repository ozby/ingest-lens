import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./command";

const clientRoot = path.join(repoRoot, "apps/client");

function readClientSource(relativePath: string): string {
  return readFileSync(path.join(clientRoot, "src", relativePath), "utf8");
}

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(nextPath);
    }
    if (!entry.isFile()) {
      return [];
    }
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) {
      return [];
    }
    if (/\.test\.(?:ts|tsx)$/u.test(entry.name)) {
      return [];
    }
    return [nextPath];
  });
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

    const staleCopyPattern =
      /PubSub Dashboard|Overview of your message queuing system|Monitor the performance of your message queuing system/u;
    const staleCopyMatches = collectSourceFiles(path.join(clientRoot, "src")).filter((filePath) =>
      staleCopyPattern.test(readFileSync(filePath, "utf8")),
    );

    expect(staleCopyMatches).toEqual([]);
  }, 120_000);
});
