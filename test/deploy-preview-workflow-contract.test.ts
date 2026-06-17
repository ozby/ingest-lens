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

test("deploy production uses the public github-actions reusable workflow", () => {
  const workflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");
  assert.match(
    workflow,
    /uses:\s*webpresso\/github-actions\/.github\/workflows\/cloudflare-production\.yml@[0-9a-f]{40}/u,
  );
  assert.doesNotMatch(
    workflow,
    /uses:\s*webpresso\/agent-kit\/.github\/workflows\/cloudflare-production/u,
  );
});

test("release workflow delegates to the public changesets release harness", () => {
  const workflow = readFileSync(".github/workflows/release.yml", "utf8");
  assert.match(
    workflow,
    /uses:\s*webpresso\/github-actions\/.github\/workflows\/changesets-release\.yml@[0-9a-f]{40}/u,
  );
  assert.match(workflow, /version_command: pnpm run version/u);
  assert.match(workflow, /publish_command: pnpm run release:publish/u);
});
