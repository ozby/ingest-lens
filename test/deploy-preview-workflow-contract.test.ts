import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy-preview.yml", "utf8");

test("deploy preview uses the public github-actions reusable workflow", () => {
  assert.match(
    workflow,
    /uses:\s*webpresso\/github-actions\/.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
  );
  assert.doesNotMatch(
    workflow,
    /uses:\s*webpresso\/agent-kit\/.github\/workflows\/cloudflare-preview/u,
  );
});
