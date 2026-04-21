#!/usr/bin/env bun
// Enforce docs/ frontmatter rules:
//   1. Every .md file under docs/ has frontmatter with `type` and `last_updated`.
//   2. `type` is one of the allowed values.
//   3. `type` matches the parent folder under docs/ (e.g. docs/guides/* → type: guide).
//
// Exits 1 on any violation.

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");

const ALLOWED_TYPES = new Set([
  "guide",
  "system",
  "research",
  "runbook",
  "postmortem",
  "adr",
  "migration",
  "template",
  "docs-index",
]);

// Folder → expected type. Any folder not in this map does not have a folder-matching requirement.
const FOLDER_TO_TYPE: Record<string, string> = {
  guides: "guide",
  system: "system",
  research: "research",
  runbooks: "runbook",
  postmortem: "postmortem",
  adrs: "adr",
  migrations: "migration",
  templates: "template",
};

type Violation = { file: string; message: string };

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile() && full.endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

function parseFrontmatter(markdown: string): Record<string, string> | null {
  if (!markdown.startsWith("---\n")) return null;
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const body = markdown.slice(4, end);
  const map: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match) map[match[1]] = match[2].replace(/^"(.*)"$/, "$1").trim();
  }
  return map;
}

function categoryFolder(fileRel: string): string | null {
  const parts = fileRel.split(path.sep);
  return parts.length >= 2 ? parts[1] : null;
}

function main(): void {
  const files = walk(docsRoot);
  const violations: Violation[] = [];

  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const folder = categoryFolder(rel);
    const content = fs.readFileSync(file, "utf8");
    const fm = parseFrontmatter(content);

    if (!fm) {
      violations.push({ file: rel, message: "missing frontmatter" });
      continue;
    }
    if (!fm.type)
      violations.push({ file: rel, message: "frontmatter missing `type`" });
    if (!fm.last_updated)
      violations.push({
        file: rel,
        message: "frontmatter missing `last_updated`",
      });

    // docs/templates/ files model the final doc shape — exempt from the allowlist
    // and folder-type match checks. They are still required to have `type` + `last_updated`.
    if (folder === "templates") continue;

    if (fm.type && !ALLOWED_TYPES.has(fm.type)) {
      violations.push({
        file: rel,
        message: `frontmatter type "${fm.type}" is not one of ${[...ALLOWED_TYPES].join(", ")}`,
      });
    }

    if (folder && FOLDER_TO_TYPE[folder]) {
      const expected = FOLDER_TO_TYPE[folder];
      if (fm.type && fm.type !== expected) {
        violations.push({
          file: rel,
          message: `docs/${folder}/ requires type: ${expected}; got type: ${fm.type}`,
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error("docs frontmatter violations:");
    for (const v of violations) console.error(`- ${v.file}: ${v.message}`);
    process.exit(1);
  }

  console.log(`docs frontmatter OK (${files.length} files checked).`);
}

main();
