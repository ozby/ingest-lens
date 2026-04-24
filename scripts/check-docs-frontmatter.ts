#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const docsRoot = join(repoRoot, "docs");
const allowedTypes = new Set([
  "adr",
  "blueprint",
  "docs-index",
  "guide",
  "migration",
  "postmortem",
  "research",
  "runbook",
  "system",
  "tech-debt",
  "template",
]);

function collectMarkdownFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectMarkdownFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [absolutePath] : [];
  });
}

function parseFrontmatter(contents: string): Record<string, string> | null {
  if (!contents.startsWith("---\n")) {
    return null;
  }

  const endIndex = contents.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return null;
  }

  const frontmatterBlock = contents.slice(4, endIndex);
  const fields: Record<string, string> = {};

  for (const line of frontmatterBlock.split(/\r?\n/u)) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/u);
    if (!match) continue;
    fields[match[1]] = match[2].replace(/^['"]|['"]$/gu, "").trim();
  }

  return fields;
}

function main(): void {
  const markdownFiles = collectMarkdownFiles(docsRoot);
  const failures: string[] = [];

  for (const filePath of markdownFiles) {
    const relativePath = relative(repoRoot, filePath);
    const frontmatter = parseFrontmatter(readFileSync(filePath, "utf8"));
    const isTemplate =
      relativePath.startsWith("docs/templates/") || relativePath === "docs/adrs/TEMPLATE.md";

    if (!frontmatter) {
      failures.push(`${relativePath} is missing YAML frontmatter.`);
      continue;
    }

    const type = frontmatter.type;
    const lastUpdated = frontmatter.last_updated;

    if (!type) {
      failures.push(`${relativePath} is missing required frontmatter key "type".`);
    } else if (!allowedTypes.has(type)) {
      failures.push(`${relativePath} has unsupported type "${type}".`);
    }

    if (!lastUpdated) {
      failures.push(`${relativePath} is missing required frontmatter key "last_updated".`);
    } else if (!isTemplate && !/^\d{4}-\d{2}-\d{2}$/u.test(lastUpdated)) {
      failures.push(`${relativePath} has invalid last_updated "${lastUpdated}".`);
    }
  }

  if (failures.length > 0) {
    console.error("Docs frontmatter check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Docs frontmatter check passed for ${markdownFiles.length} markdown files.`);
}

main();
