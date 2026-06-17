import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

test("CI workflow exposes wp-check as the branch-protection-facing gate", () => {
  assert.match(workflow, /\n  wp-check:\n/u);
  assert.match(workflow, /name:\s*wp-check/u);
  assert.doesNotMatch(workflow, /\n  check:\n/u);
});
