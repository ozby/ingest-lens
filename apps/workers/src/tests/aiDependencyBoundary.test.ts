declare global {
  interface ImportMeta {
    glob<T = unknown>(
      pattern: string,
      options: { eager: true; import: string; query: string },
    ): Record<string, T>;
  }
}

import { describe, expect, it } from "vitest";

const BLOCKED_DEPENDENCIES = ["ai", "workers-ai-provider", "ajv", "@sinclair/typebox"] as const;

const STATIC_IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)\s+[\s\S]*?from\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT_PATTERN = /(?:^|\n)\s*import\s*\(\s*["']([^"']+)["']\s*\)/g;

const SOURCE_FILES = {
  ...import.meta.glob("../**/*.ts", {
    eager: true,
    import: "default",
    query: "?raw",
  }),
  ...import.meta.glob("../**/*.tsx", {
    eager: true,
    import: "default",
    query: "?raw",
  }),
} as Record<string, string>;

function isInsideIntake(relativePath: string): boolean {
  return relativePath.startsWith("../intake/");
}

function normalizePath(relativePath: string): string {
  return relativePath.replace(/^\.\.\//, "");
}

function findBlockedImports(source: string): Array<{ dependency: string; line: number }> {
  const matches: Array<{ dependency: string; line: number }> = [];

  for (const pattern of [STATIC_IMPORT_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
    pattern.lastIndex = 0;

    for (const match of source.matchAll(pattern)) {
      const dependency = match[1];
      if (
        !dependency ||
        !BLOCKED_DEPENDENCIES.includes(dependency as (typeof BLOCKED_DEPENDENCIES)[number])
      ) {
        continue;
      }

      const statementStart = match.index ?? 0;
      const line = source.slice(0, statementStart).split("\n").length;
      matches.push({ dependency, line });
    }
  }

  return matches;
}

describe("AI dependency boundary", () => {
  it("keeps AI adapter dependencies inside src/intake only", () => {
    const violations = Object.entries(SOURCE_FILES)
      .filter(([relativePath]) => !isInsideIntake(relativePath))
      .flatMap(([relativePath, source]) =>
        findBlockedImports(source).map(({ dependency, line }) => ({
          dependency,
          line,
          relativePath: normalizePath(relativePath),
        })),
      );

    expect(violations).toEqual([]);
  });
});
