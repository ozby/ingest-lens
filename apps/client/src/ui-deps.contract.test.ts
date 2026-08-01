/**
 * Durability after public @webpresso/ui cutover:
 * - product UI comes from the registry package
 * - no dead direct @radix-ui/* deps without a live source import
 * - toast stack stays sonner-only (no parallel half-dead toast deps)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientRoot = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(clientRoot, "..", "package.json");
const srcRoot = clientRoot;

describe("client UI dependency contract", () => {
  it("depends on public @webpresso/ui and does not reintroduce private @repo/ui", () => {
    const pkg = readClientPackageJson();
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["@webpresso/ui"]).toBeTruthy();
    expect(deps["@repo/ui"]).toBeUndefined();
  });

  it("does not declare @radix-ui packages without a live source import", () => {
    const pkg = readClientPackageJson();
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const radixDeps = Object.keys(deps).filter((name) => name.startsWith("@radix-ui/"));
    const sourceText = collectClientSourceText(srcRoot);
    const unused = radixDeps.filter((name) => {
      // Live import forms: from "@radix-ui/..." or from '@radix-ui/...'
      return !sourceText.includes(`from "${name}"`) && !sourceText.includes(`from '${name}'`);
    });
    expect(unused).toEqual([]);
  });

  it("keeps sonner as the live toast stack when declared", () => {
    const pkg = readClientPackageJson();
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!deps.sonner) {
      // If sonner is removed later, this contract is N/A until a new toast path is declared.
      return;
    }
    const sourceText = collectClientSourceText(srcRoot);
    expect(sourceText.includes(`from "sonner"`) || sourceText.includes(`from 'sonner'`)).toBe(true);
  });
});

function readClientPackageJson(): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  expect(existsSync(packageJsonPath)).toBe(true);
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

function collectClientSourceText(root: string): string {
  const chunks: string[] = [];
  const skipDirs = new Set(["node_modules", "dist", "coverage"]);
  const scannable = /\.(?:[cm]?[jt]sx?)$/u;

  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skipDirs.has(entry)) continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile() || !scannable.test(entry)) continue;
      // Skip this contract file when scanning so self-mentions cannot fake usage.
      const rel = relative(root, full).replaceAll("\\", "/");
      if (rel.endsWith("ui-deps.contract.test.ts")) continue;
      try {
        chunks.push(readFileSync(full, "utf8"));
      } catch {
        // ignore unreadable files
      }
    }
  };

  walk(root);
  return chunks.join("\n");
}
