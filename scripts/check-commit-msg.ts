#!/usr/bin/env bun
// Lightweight commit-message validator.
//
// Contract:
//   - First non-empty, non-comment line is the subject.
//   - Subject must match <type>(<scope>)?(!)?: <message>
//   - <type> is one of the conventional-commit types below.
//   - Subject length ≤ 100 chars.
//   - Second line (if present) must be blank.
//   - `[lore]` tag in the subject requires a `Confidence:` trailer and at
//     least one of Constraint: / Rejected: / Directive:  (see
//     adr-lore-commit-protocol blueprint).
//
// This runs in the commit-msg hook. It should stay fast and dependency-free.

import fs from "node:fs";

const msgPath = process.argv[2];
if (!msgPath) {
  console.error(
    "usage: bun ./scripts/check-commit-msg.ts <path-to-commit-msg>",
  );
  process.exit(2);
}

const raw = fs.readFileSync(msgPath, "utf8");
const lines = raw.split("\n");

// Git merge/revert/squash commits use non-conventional subjects — skip validation.
const firstRealCheck = lines.find(
  (l: string) => l.trim() !== "" && !l.startsWith("#"),
);
if (firstRealCheck && /^(Merge |Revert |Squash merge )/.test(firstRealCheck)) {
  console.log("commit-msg OK (merge/revert exempt)");
  process.exit(0);
}

const ALLOWED_TYPES = [
  "feat",
  "fix",
  "docs",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
  "style",
  "infra",
  "sec",
];

const SUBJECT_RE = new RegExp(
  String.raw`^(${ALLOWED_TYPES.join("|")})(\([a-z0-9][a-z0-9-]*\))?(!)?:\s.+$`,
);

function firstRealLine(): { line: string; index: number } | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("#")) continue;
    if (line.trim() === "") continue;
    return { line, index: i };
  }
  return null;
}

function fail(message: string): never {
  console.error(`commit-msg: ${message}`);
  console.error("");
  console.error("Expected subject: <type>(<scope>)?(!)?: <message>");
  console.error(`Allowed types: ${ALLOWED_TYPES.join(", ")}`);
  console.error("");
  console.error("Examples:");
  console.error("  feat(api-server): accept signed delivery receipts");
  console.error("  fix(db): idempotency key now honors tenant scope");
  console.error("  docs: update blueprint lifecycle diagram");
  console.error("  ci!: require tsgo check on pre-push");
  process.exit(1);
}

const first = firstRealLine();
if (!first) fail("commit message is empty");

const { line: subject, index: subjectIndex } = first;

if (subject.length > 100) fail(`subject is ${subject.length} chars (max 100)`);
if (!SUBJECT_RE.test(subject))
  fail(`subject does not match conventional-commit format: "${subject}"`);

const secondLine = lines[subjectIndex + 1];
if (secondLine !== undefined && secondLine.trim() !== "") {
  fail("second line must be blank (separates subject from body)");
}

if (subject.includes("[lore]")) {
  const body = lines.slice(subjectIndex + 1).join("\n");
  if (!/^Confidence:\s+\S+/m.test(body)) {
    fail("`[lore]` commits require a `Confidence:` trailer");
  }
  if (!/^(Constraint|Rejected|Directive):\s+\S+/m.test(body)) {
    fail(
      "`[lore]` commits require at least one of `Constraint:`, `Rejected:`, or `Directive:` trailers",
    );
  }
}

console.log("commit-msg OK");
