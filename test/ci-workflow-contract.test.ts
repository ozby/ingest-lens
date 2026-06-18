import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

test("CI workflow exposes wp-check as the branch-protection-facing gate", () => {
  assert.match(workflow, /\n  wp-check:\n/u);
  assert.match(workflow, /name:\s*wp-check/u);
  assert.doesNotMatch(workflow, /\n  check:\n/u);
});

test("CI skips mutation for generated Version Packages merges", () => {
  assert.match(workflow, /!startsWith\(github\.event\.head_commit\.message, 'Version Packages'\)/u);
});

test("release automation skips heavy PR and merge validations outside the release lane", () => {
  const e2eWorkflow = readFileSync(".github/workflows/e2e.yml", "utf8");
  const e2eActWorkflow = readFileSync(".github/workflows/e2e-act.yml", "utf8");
  const previewWorkflow = readFileSync(".github/workflows/deploy-preview.yml", "utf8");
  const securityWorkflow = readFileSync(".github/workflows/security-scan.yml", "utf8");
  const cleanupWorkflow = readFileSync(
    ".github/workflows/cleanup-stale-neon-e2e-branches.yml",
    "utf8",
  );

  assert.match(e2eWorkflow, /github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u);
  assert.match(
    e2eWorkflow,
    /!startsWith\(github\.event\.head_commit\.message, 'Version Packages'\)/u,
  );
  assert.match(e2eWorkflow, /SECRET_MANAGER_TOKEN: \$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u);
  assert.match(e2eWorkflow, /DOPPLER_TOKEN: \$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u);
  assert.match(e2eWorkflow, /RUN_E2E: "1"/u);
  assert.doesNotMatch(e2eWorkflow, /NEON_API_KEY: \$\{\{ secrets\.NEON_API_KEY \}\}/u);
  assert.doesNotMatch(e2eWorkflow, /BETTER_AUTH_SECRET: \$\{\{ secrets\.BETTER_AUTH_SECRET \}\}/u);
  assert.doesNotMatch(
    e2eWorkflow,
    /LANGFUSE_SECRET_KEY: \$\{\{ secrets\.LANGFUSE_SECRET_KEY \}\}/u,
  );
  assert.match(e2eActWorkflow, /RUN_E2E: "1"/u);
  assert.match(e2eActWorkflow, /Bridge local act secrets/u);
  assert.match(e2eActWorkflow, /printf '%s=%s\\n' "\$key" "\$value" >> "\$GITHUB_ENV"/u);
  assert.match(
    e2eActWorkflow,
    /SECRET_MANAGER_TOKEN_SECRET: \$\{\{ secrets\.SECRET_MANAGER_TOKEN \|\| secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u,
  );
  assert.match(
    e2eActWorkflow,
    /DOPPLER_TOKEN_SECRET: \$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \|\| secrets\.DOPPLER_TOKEN \|\| secrets\.SECRET_MANAGER_TOKEN \}\}/u,
  );
  assert.match(e2eActWorkflow, /Install Doppler CLI/u);
  assert.match(e2eActWorkflow, /NEON_API_KEY_SECRET: \$\{\{ secrets\.NEON_API_KEY \}\}/u);
  assert.match(
    e2eActWorkflow,
    /BETTER_AUTH_SECRET_SECRET: \$\{\{ secrets\.BETTER_AUTH_SECRET \}\}/u,
  );
  assert.doesNotMatch(e2eActWorkflow, /^      NEON_API_KEY: \$\{\{ secrets\.NEON_API_KEY \}\}/mu);
  assert.match(e2eWorkflow, /Install PostgreSQL client/u);
  assert.match(e2eActWorkflow, /Install PostgreSQL client/u);
  assert.match(e2eWorkflow, /command -v psql/u);
  assert.match(e2eWorkflow, /timeout 180s sudo apt-get install/u);
  assert.match(e2eActWorkflow, /timeout 180s .*apt-get install/u);
  assert.match(
    previewWorkflow,
    /github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u,
  );
  assert.match(
    previewWorkflow,
    /ci_secret_provider_token: \$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u,
  );
  assert.match(
    securityWorkflow,
    /github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u,
  );
  assert.match(cleanupWorkflow, /HAS_CI_SECRET_PROVIDER_TOKEN/u);
  assert.match(cleanupWorkflow, /doppler-token: \$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u);
  assert.match(
    e2eWorkflow,
    /pnpm --dir apps\/e2e exec playwright install --with-deps --only-shell chromium/u,
  );
});
