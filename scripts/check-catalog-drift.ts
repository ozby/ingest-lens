/**
 * check-catalog-drift.ts
 *
 * Reads pnpm-workspace.yaml catalog entries, scans all workspace package.json
 * files, and reports any dependency used in ≥2 workspaces that has an explicit
 * version string instead of a catalog: reference.
 *
 * Exit 1 if drift is found.
 *
 * Run with: bun ./scripts/check-catalog-drift.ts
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DependencyMap = Record<string, string>;

interface PackageJson {
  name?: string;
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
}

interface WorkspaceEntry {
  workspacePath: string;
  depName: string;
  depType: "dependencies" | "devDependencies" | "peerDependencies";
  version: string;
}

// ---------------------------------------------------------------------------
// YAML catalog parser (minimal — only handles the catalog/catalogs blocks)
// ---------------------------------------------------------------------------

function parseCatalogNames(yamlText: string): Set<string> {
  const catalogNames = new Set<string>();
  const lines = yamlText.split("\n");

  // State machine: are we inside a catalog block?
  let inCatalog = false;
  let inCatalogs = false;
  let inNamedCatalog = false;
  let currentIndent = 0;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.trimStart().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level `catalog:` block
    if (/^catalog:\s*$/.test(trimmed)) {
      inCatalog = true;
      inCatalogs = false;
      inNamedCatalog = false;
      currentIndent = indent;
      continue;
    }

    // Top-level `catalogs:` block
    if (/^catalogs:\s*$/.test(trimmed)) {
      inCatalogs = true;
      inCatalog = false;
      inNamedCatalog = false;
      currentIndent = indent;
      continue;
    }

    if (inCatalog) {
      if (indent <= currentIndent && trimmed.match(/^\S/)) {
        // Left the catalog block
        inCatalog = false;
        continue;
      }
      // Lines of form `  "pkg-name": version` or `  pkg-name: version`
      const match = trimmed.match(/^["']?(@?[^"':]+(?:\/[^"':]+)?)["']?\s*:/);
      if (match) {
        catalogNames.add(match[1].trim());
      }
      continue;
    }

    if (inCatalogs) {
      // Named catalog header, e.g. `  tooling:` or `  workers:`
      if (indent === currentIndent + 2 && trimmed.endsWith(":") && !trimmed.includes('"')) {
        inNamedCatalog = true;
        continue;
      }
      if (inNamedCatalog) {
        if (indent <= currentIndent + 2 && trimmed.match(/^\S/) && !trimmed.endsWith(":")) {
          // Back to catalog-name level or higher
          inNamedCatalog = false;
          continue;
        }
        const match = trimmed.match(/^["']?(@?[^"':]+(?:\/[^"':]+)?)["']?\s*:/);
        if (match) {
          catalogNames.add(match[1].trim());
        }
      }
    }
  }

  return catalogNames;
}

// ---------------------------------------------------------------------------
// Workspace discovery
// ---------------------------------------------------------------------------

function discoverWorkspacePackages(root: string): string[] {
  const workspaceYaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf-8");
  const globs: string[] = [];
  for (const line of workspaceYaml.split("\n")) {
    const m = line.match(/^\s+-\s+["']?(.+?)["']?\s*$/);
    if (m && !m[1].startsWith("#")) {
      globs.push(m[1]);
    }
  }

  const packages: string[] = [];
  for (const glob of globs) {
    // Only handle `dir/*` patterns — good enough for this repo
    const base = glob.replace(/\/\*$/, "");
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory() && existsSync(join(full, "package.json"))) {
        packages.push(full);
      }
    }
  }
  return packages;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, "..");
const workspaceYamlText = readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf-8");
const catalogNames = parseCatalogNames(workspaceYamlText);

const workspacePaths = discoverWorkspacePackages(ROOT);

// Map dep name → list of {workspacePath, version, depType}
const depUsage = new Map<string, WorkspaceEntry[]>();

// peerDependencies are constraints (e.g. ">=18"), not installed deps — exclude from drift check
const DEP_TYPES = ["dependencies", "devDependencies"] as const;

for (const wsPath of workspacePaths) {
  const pkgRaw = readFileSync(join(wsPath, "package.json"), "utf-8");
  const pkg: PackageJson = JSON.parse(pkgRaw);

  for (const depType of DEP_TYPES) {
    const deps = pkg[depType];
    if (!deps) continue;
    for (const [name, version] of Object.entries(deps)) {
      if (!depUsage.has(name)) depUsage.set(name, []);
      depUsage.get(name)!.push({ workspacePath: wsPath, depName: name, depType, version });
    }
  }
}

// Find drift: used in ≥2 workspaces AND at least one entry is NOT a catalog: reference
const driftEntries: Array<{ depName: string; entries: WorkspaceEntry[] }> = [];

for (const [depName, entries] of depUsage.entries()) {
  if (entries.length < 2) continue;
  // Check if any entry has an explicit version (not catalog:)
  const nonCatalog = entries.filter(
    (e) => !e.version.startsWith("catalog:") && !e.version.startsWith("workspace:")
  );
  if (nonCatalog.length === 0) continue;

  // Only flag if the dep is actually in the catalog. If it's NOT in the catalog
  // and used in ≥2 workspaces that's still drift — flag it either way.
  driftEntries.push({ depName, entries: nonCatalog });
}

if (driftEntries.length === 0) {
  console.log("✓ No catalog drift detected. All shared deps use catalog: references.");
  process.exit(0);
}

console.error(`\n✗ Catalog drift detected — ${driftEntries.length} package(s) need catalog: references:\n`);

for (const { depName, entries } of driftEntries) {
  const inCatalog = catalogNames.has(depName);
  const catalogHint = inCatalog ? "(already in catalog)" : "(ADD to catalog first)";
  console.error(`  ${depName} ${catalogHint}`);
  for (const e of entries) {
    const shortPath = e.workspacePath.replace(ROOT + "/", "");
    console.error(`    ${shortPath} [${e.depType}] = "${e.version}"`);
  }
}

console.error(
  "\nFix: replace explicit version strings with catalog: (or catalog:<name>) in the listed package.json files."
);
process.exit(1);
