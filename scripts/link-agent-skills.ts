#!/usr/bin/env bun
// Keep shared skills in sync across .agent/, .claude/, and .codex/.
//
// Source of truth: .agent/skills/<name>/SKILL.md
//   - .claude/skills  -> ../.agent/skills        (folder symlink)
//   - .codex/skills/<name> -> ../../.agent/skills/<name>
//         for every <name> that also exists under .agent/skills/
//
// Codex-native-only skills already present under .codex/skills/ are left alone.
// Running this script is idempotent.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentSkills = path.join(repoRoot, ".agent", "skills");
const claudeDir = path.join(repoRoot, ".claude");
const claudeSkills = path.join(claudeDir, "skills");
const codexSkills = path.join(repoRoot, ".codex", "skills");

type LogKind = "ok" | "skip" | "link" | "warn";

function log(kind: LogKind, message: string): void {
  const tag = kind === "ok" ? " ok " : kind === "skip" ? "skip" : kind === "link" ? "link" : "warn";
  console.log(`[${tag}] ${message}`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log("ok", `created ${path.relative(repoRoot, dir)}`);
  }
}

function isSymlinkTo(target: string, expectedAbsolute: string): boolean {
  if (!fs.existsSync(target)) return false;
  const lst = fs.lstatSync(target);
  if (!lst.isSymbolicLink()) return false;
  const actual = path.resolve(path.dirname(target), fs.readlinkSync(target));
  return actual === expectedAbsolute;
}

function linkDir(from: string, toRelative: string): void {
  const expected = path.resolve(path.dirname(from), toRelative);
  if (isSymlinkTo(from, expected)) {
    log("skip", `${path.relative(repoRoot, from)} already linked`);
    return;
  }
  if (fs.existsSync(from)) {
    const stat = fs.lstatSync(from);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      const entries = fs.readdirSync(from);
      if (entries.length > 0) {
        log(
          "warn",
          `${path.relative(repoRoot, from)} is a real dir with ${entries.length} entries — refusing to replace. Move its contents into .agent/skills first.`,
        );
        process.exitCode = 1;
        return;
      }
      fs.rmdirSync(from);
    } else {
      fs.unlinkSync(from);
    }
  }
  fs.symlinkSync(toRelative, from);
  log("link", `${path.relative(repoRoot, from)} -> ${toRelative}`);
}

function main(): void {
  if (!fs.existsSync(agentSkills)) {
    console.error(`source of truth missing: ${path.relative(repoRoot, agentSkills)}`);
    process.exit(1);
  }

  ensureDir(claudeDir);
  linkDir(claudeSkills, "../.agent/skills");

  ensureDir(codexSkills);
  const sharedSkills = fs
    .readdirSync(agentSkills)
    .filter((name) => fs.statSync(path.join(agentSkills, name)).isDirectory());

  for (const skill of sharedSkills) {
    const target = path.join(codexSkills, skill);
    linkDir(target, path.join("..", "..", ".agent", "skills", skill));
  }

  if (process.exitCode && process.exitCode !== 0) return;
  log("ok", "shared skills linked");
}

main();
