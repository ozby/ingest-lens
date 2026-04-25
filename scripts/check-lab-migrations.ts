#!/usr/bin/env bun
/**
 * CI guard: rejects any migration in packages/lab-core/migrations/ that
 * contains public. DDL (e.g., CREATE TABLE public.foo, ALTER TABLE public.bar).
 *
 * Usage:
 *   bun scripts/check-lab-migrations.ts
 *
 * Exit 0 = no violations. Exit 1 = violations found.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "../packages/lab-core/migrations");

// Matches public.<identifier> in SQL (case-insensitive)
// This covers: public.table_name, "public".table_name, public."table_name"
const PUBLIC_DDL_PATTERN = /\bpublic\s*\.\s*\w/i;

let violations = 0;

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

if (files.length === 0) {
  console.log("check-lab-migrations: no .sql files found in migrations/");
  process.exit(0);
}

for (const file of files) {
  const path = join(MIGRATIONS_DIR, file);
  const content = readFileSync(path, "utf-8");

  const lines = content.split("\n");
  const violatingLines: { line: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!;
    // Skip comment lines
    if (text.trimStart().startsWith("--")) continue;
    if (PUBLIC_DDL_PATTERN.test(text)) {
      violatingLines.push({ line: i + 1, text: text.trim() });
    }
  }

  if (violatingLines.length > 0) {
    console.error(`\nFAIL: ${file} contains public.* DDL (F-12 violation):`);
    for (const { line, text } of violatingLines) {
      console.error(`  Line ${line}: ${text}`);
    }
    violations++;
  } else {
    console.log(`OK: ${file}`);
  }
}

if (violations > 0) {
  console.error(
    `\ncheck-lab-migrations: ${violations} file(s) with public.* DDL — fix before merge.`,
  );
  process.exit(1);
} else {
  console.log("\ncheck-lab-migrations: all migrations clean (no public.* DDL).");
  process.exit(0);
}
