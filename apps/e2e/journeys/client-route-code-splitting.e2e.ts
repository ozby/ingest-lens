import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot, runCommand } from "./command";

const clientRoot = path.join(repoRoot, "apps/client");
const buildEnv = { ...process.env, NODE_ENV: "production" };

function readIndexHtml(): string {
  return readFileSync(path.join(clientRoot, "dist/index.html"), "utf8");
}

describe("client route code splitting", () => {
  it("builds route-split assets without large-chunk regressions", () => {
    const build = runCommand("pnpm", ["run", "build"], {
      cwd: clientRoot,
      env: buildEnv,
    });
    expect(build.status).toBe(0);
    expect(build.combinedOutput).not.toContain(
      "Some chunks are larger than 500 kB after minification",
    );

    const assetDir = path.join(clientRoot, "dist/assets");
    const assetFiles = readdirSync(assetDir);
    const expectedRouteChunks = [
      /^AdminIntake-.*\.js$/u,
      /^Dashboard-.*\.js$/u,
      /^Intake-.*\.js$/u,
      /^Metrics-.*\.js$/u,
      /^Queues-.*\.js$/u,
      /^Topics-.*\.js$/u,
    ];
    for (const pattern of expectedRouteChunks) {
      expect(assetFiles.some((file) => pattern.test(file))).toBe(true);
    }

    const generatedJavaScriptAssets = assetFiles.filter((file) => file.endsWith(".js"));
    expect(generatedJavaScriptAssets.length).toBeGreaterThan(6);

    const maxJsAssetBytes = 512_000;
    for (const asset of generatedJavaScriptAssets) {
      const assetPath = path.join(assetDir, asset);
      expect(statSync(assetPath).size).toBeLessThanOrEqual(maxJsAssetBytes);
    }

    const html = readIndexHtml();
    const eagerAssetPaths = Array.from(
      new Set([...html.matchAll(/assets\/[^"' ]+\.js/gu)].map(([match]) => match)),
    );
    const eagerAssetSizes = eagerAssetPaths.map(
      (assetPath) => statSync(path.join(clientRoot, "dist", assetPath)).size,
    );
    const htmlEagerTotalBytes = eagerAssetSizes.reduce((sum, size) => sum + size, 0);

    expect(Math.max(...eagerAssetSizes)).toBeLessThanOrEqual(262_144);
    expect(htmlEagerTotalBytes).toBeLessThanOrEqual(393_216);

    const bundleGate = runCommand("pnpm", ["client:bundle:check"], {
      cwd: repoRoot,
      env: buildEnv,
    });
    expect(bundleGate.status).toBe(0);
  }, 120_000);
});
