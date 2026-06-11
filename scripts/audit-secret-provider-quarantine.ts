#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".agent",
  ".codex",
  ".omx",
  ".omc",
  "blueprints",
  "dist",
  "coverage",
  // Git worktrees are separate repos checked out locally; their files are
  // not part of this repo's tracked surface and must not be scanned.
  "_worktrees",
]);

const TEXT_FILE_PATTERN = /\.(md|ts|tsx|js|json|ya?ml|toml|txt)$/i;

const BANNED_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bdoppler run\b/, message: "use `with-secrets -- <cmd>` instead of `doppler run`" },
  {
    pattern: /\bwith-secrets\s+--doppler\b/,
    message: "use selected-manager `with-secrets -- <cmd>` instead of provider flags",
  },
  {
    pattern: /\bdoppler secrets download\b/,
    message: "load secrets through runtime/env, not direct Doppler downloads",
  },
  {
    pattern: /runtime\/process\/secret-runner/,
    message:
      "use `@repo/runtime-env-local` (built on `@webpresso/runtime-env`) instead of secret-runner",
  },
];

const violations: string[] = [];
const SELF_RELATIVE_PATH = "scripts/audit-secret-provider-quarantine.ts";

walk(ROOT);

if (violations.length > 0) {
  console.error("Secret-provider quarantine violations detected:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Secret-provider quarantine: clean.");

function walk(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile() || !TEXT_FILE_PATTERN.test(entry.name)) {
      continue;
    }

    const content = readFileSync(fullPath, "utf8");
    const relPath = relative(ROOT, fullPath);
    if (relPath === SELF_RELATIVE_PATH) {
      continue;
    }

    for (const { pattern, message } of BANNED_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${relPath}: ${message}`);
      }
    }
  }
}
