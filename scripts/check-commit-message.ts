#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import process from "node:process";

const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);
const EVIDENCE_TRAILERS = ["Constraint", "Rejected", "Directive"] as const;

function readCommitMessage(path: string): string[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => !line.startsWith("#"));
}

function main(): void {
  const messageFile = process.argv[2];
  if (!messageFile) {
    console.error("Usage: bun ./scripts/check-commit-message.ts <message-file>");
    process.exit(1);
  }

  const lines = readCommitMessage(messageFile);
  const trailers = new Map<string, string[]>();

  for (const line of lines) {
    const trailerMatch = line.match(/^([A-Za-z][A-Za-z-]*):\s+(.+)$/u);
    if (!trailerMatch) continue;

    const [, key, value] = trailerMatch;
    const nextValues = trailers.get(key) ?? [];
    nextValues.push(value.trim());
    trailers.set(key, nextValues);
  }

  const confidenceValues = trailers.get("Confidence") ?? [];
  if (confidenceValues.length === 0) {
    console.error('Lore commit validation failed: missing required trailer "Confidence:".');
    process.exit(1);
  }

  if (!confidenceValues.some((value) => VALID_CONFIDENCE.has(value))) {
    console.error(
      'Lore commit validation failed: "Confidence:" must be one of low, medium, or high.',
    );
    process.exit(1);
  }

  const hasEvidenceTrailer = EVIDENCE_TRAILERS.some((key) => (trailers.get(key)?.length ?? 0) > 0);
  if (!hasEvidenceTrailer) {
    console.error(
      'Lore commit validation failed: include at least one of "Constraint:", "Rejected:", or "Directive:".',
    );
    process.exit(1);
  }
}

main();
