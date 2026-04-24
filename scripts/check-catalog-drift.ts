#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

type Manifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const repoRoot = process.cwd();
const workspaceManifestPaths = [
  "package.json",
  ...readdirSync(join(repoRoot, "apps"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("apps", entry.name, "package.json")),
  ...readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("packages", entry.name, "package.json")),
  join("infra", "package.json"),
].filter((manifestPath) => existsSync(join(repoRoot, manifestPath)));

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/gu, "");
}

function parseCatalogSpecs(workspaceFile: string): Map<string, Set<string>> {
  const specs = new Map<string, Set<string>>();
  const lines = readFileSync(workspaceFile, "utf8").split(/\r?\n/u);
  let section: "none" | "catalog" | "catalogs" = "none";
  let namedCatalog: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/gu, "    ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (/^catalog:\s*$/u.test(trimmed)) {
      section = "catalog";
      namedCatalog = null;
      continue;
    }

    if (/^catalogs:\s*$/u.test(trimmed)) {
      section = "catalogs";
      namedCatalog = null;
      continue;
    }

    if (!rawLine.startsWith(" ")) {
      section = "none";
      namedCatalog = null;
      continue;
    }

    if (section === "catalog") {
      const match = line.match(/^\s{2}([^:#][^:]*?):\s*/u);
      if (!match) continue;
      const dependency = stripQuotes(match[1].trim());
      const allowed = specs.get(dependency) ?? new Set<string>();
      allowed.add("catalog:");
      specs.set(dependency, allowed);
      continue;
    }

    if (section === "catalogs") {
      const catalogMatch = line.match(/^\s{2}([^:#][^:]*?):\s*$/u);
      if (catalogMatch) {
        namedCatalog = stripQuotes(catalogMatch[1].trim());
        continue;
      }

      const dependencyMatch = line.match(/^\s{4}([^:#][^:]*?):\s*/u);
      if (!dependencyMatch || !namedCatalog) continue;
      const dependency = stripQuotes(dependencyMatch[1].trim());
      const allowed = specs.get(dependency) ?? new Set<string>();
      allowed.add(`catalog:${namedCatalog}`);
      specs.set(dependency, allowed);
    }
  }

  return specs;
}

function readManifest(relativePath: string): Manifest {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as Manifest;
}

function main(): void {
  const catalogSpecs = parseCatalogSpecs(join(repoRoot, "pnpm-workspace.yaml"));
  const failures: string[] = [];
  const dependencyBlocks = ["dependencies", "devDependencies", "optionalDependencies"] as const;

  for (const manifestPath of workspaceManifestPaths) {
    const manifest = readManifest(manifestPath);

    for (const block of dependencyBlocks) {
      const dependencies = manifest[block];
      if (!dependencies) continue;

      for (const [dependency, spec] of Object.entries(dependencies)) {
        const allowedSpecs = catalogSpecs.get(dependency);
        if (!allowedSpecs || allowedSpecs.has(spec)) continue;

        failures.push(
          `${manifestPath} -> ${block}.${dependency} must use ${[...allowedSpecs].join(" or ")} (found ${spec})`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error("Catalog drift check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Catalog drift check passed for ${workspaceManifestPaths.length} manifests.`);
}

main();
