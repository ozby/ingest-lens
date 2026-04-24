#!/usr/bin/env bun

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

type BudgetArgs = {
  distDir: string;
  maxJsAssetBytes: number;
  maxHtmlEagerJsAssetBytes: number;
  maxHtmlEagerJsTotalBytes: number;
};

function parseArgs(argv: string[]): BudgetArgs {
  const [distDir, ...rest] = argv;
  if (!distDir) {
    throw new Error(
      "Usage: bun ./scripts/check-client-bundle-budget.ts <dist-dir> --max-js-asset-bytes <n> --max-html-eager-js-asset-bytes <n> --max-html-eager-js-total-bytes <n>",
    );
  }

  const parsed = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument pair near ${key ?? "<missing>"}.`);
    }
    parsed.set(key, value);
  }

  const maxJsAssetBytes = Number(parsed.get("--max-js-asset-bytes"));
  const maxHtmlEagerJsAssetBytes = Number(parsed.get("--max-html-eager-js-asset-bytes"));
  const maxHtmlEagerJsTotalBytes = Number(parsed.get("--max-html-eager-js-total-bytes"));

  for (const [label, value] of [
    ["--max-js-asset-bytes", maxJsAssetBytes],
    ["--max-html-eager-js-asset-bytes", maxHtmlEagerJsAssetBytes],
    ["--max-html-eager-js-total-bytes", maxHtmlEagerJsTotalBytes],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`Missing or invalid numeric value for ${label}.`);
    }
  }

  return {
    distDir: resolve(process.cwd(), distDir),
    maxJsAssetBytes,
    maxHtmlEagerJsAssetBytes,
    maxHtmlEagerJsTotalBytes,
  };
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString("en-US")} B`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const assetDir = join(args.distDir, "assets");
  const indexHtmlPath = join(args.distDir, "index.html");
  const assetFiles = readdirSync(assetDir);
  const javascriptAssets = assetFiles.filter((file) => file.endsWith(".js"));

  const failures: string[] = [];
  for (const asset of javascriptAssets) {
    const size = statSync(join(assetDir, asset)).size;
    if (size > args.maxJsAssetBytes) {
      failures.push(
        `${asset} exceeds max JS asset budget (${formatBytes(size)} > ${formatBytes(args.maxJsAssetBytes)})`,
      );
    }
  }

  const html = readFileSync(indexHtmlPath, "utf8");
  const eagerAssetPaths = Array.from(
    new Set([...html.matchAll(/assets\/[^"' ]+\.js/gu)].map(([match]) => match)),
  );
  const eagerAssets = eagerAssetPaths.map((assetPath) => ({
    assetPath,
    size: statSync(join(args.distDir, assetPath)).size,
  }));
  const eagerTotal = eagerAssets.reduce((sum, asset) => sum + asset.size, 0);

  for (const eagerAsset of eagerAssets) {
    if (eagerAsset.size > args.maxHtmlEagerJsAssetBytes) {
      failures.push(
        `${eagerAsset.assetPath} exceeds max eager JS asset budget (${formatBytes(eagerAsset.size)} > ${formatBytes(args.maxHtmlEagerJsAssetBytes)})`,
      );
    }
  }

  if (eagerTotal > args.maxHtmlEagerJsTotalBytes) {
    failures.push(
      `HTML eager JS total exceeds budget (${formatBytes(eagerTotal)} > ${formatBytes(args.maxHtmlEagerJsTotalBytes)})`,
    );
  }

  console.log(`Checked ${javascriptAssets.length} JS assets in ${args.distDir}`);
  console.log(
    `Largest eager JS asset: ${eagerAssets.length > 0 ? formatBytes(Math.max(...eagerAssets.map((asset) => asset.size))) : "0 B"}`,
  );
  console.log(`Total eager JS: ${formatBytes(eagerTotal)}`);

  if (failures.length > 0) {
    console.error("Bundle budget check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

main();
