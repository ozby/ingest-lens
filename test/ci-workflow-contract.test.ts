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

test("CI installs global Webpresso CLIs without legacy local setup helpers", () => {
  assert.match(workflow, /name:\s*Install shared Webpresso CLIs/u);
  assert.match(
    workflow,
    /npm install -g "vite-plus@\$\{VITE_PLUS_VERSION\}" "@webpresso\/agent-kit@\$\{AGENT_KIT_VERSION\}"/u,
  );
  assert.match(workflow, /uses: oven-sh\/setup-bun@[0-9a-f]{40}/u);
  assert.doesNotMatch(workflow, /name:\s*Expose wp alias from Vite Plus/u);
  assert.doesNotMatch(workflow, /ln -sf "\$\{vp_bin\}" "\$\{RUNNER_TEMP\}\/webpresso-bin\/wp"/u);
  assert.match(workflow, /wp typecheck/u);
  assert.doesNotMatch(workflow, new RegExp("setup-" + "webpresso-toolchain", "u"));
  assert.doesNotMatch(workflow, /voidzero-dev\/setup-vp/u);
  assert.doesNotMatch(workflow, new RegExp("corepack prepare " + "pnpm@10\\.33\\.0", "u"));
});

test("CI preview deploy caller grants OIDC permissions and uses preview profile token", () => {
  const deployPreviewJob = workflow.match(/\n  deploy-preview:[\s\S]*$/u)?.[0] ?? "";

  assert.match(
    deployPreviewJob,
    /uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
  );
  assert.match(deployPreviewJob, /permissions:[\s\S]*contents:\s*read/u);
  assert.match(deployPreviewJob, /permissions:[\s\S]*packages:\s*read/u);
  assert.match(deployPreviewJob, /permissions:[\s\S]*id-token:\s*write/u);
  assert.match(deployPreviewJob, /secret_profile:\s*preview/u);
  assert.match(
    deployPreviewJob,
    /ci_secret_provider_token:\s*\$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN_PREVIEW \}\}/u,
  );
  assert.doesNotMatch(deployPreviewJob, new RegExp("cloudflare_" + "api_token:", "u"));
});

test("release automation skips heavy PR and merge validations outside the release lane", () => {
  const e2eWorkflow = readFileSync(".github/workflows/e2e.yml", "utf8");
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
  assert.doesNotMatch(e2eWorkflow, /wp-e2e\.yml/u);
  assert.match(e2eWorkflow, /workflow_dispatch:/u);
  assert.match(e2eWorkflow, /CI_SECRET_PROVIDER_TOKEN_PREVIEW/u);
  assert.ok(
    e2eWorkflow.includes(
      "CI_SECRET_PROVIDER_TOKEN: ${{ secrets.CI_SECRET_PROVIDER_TOKEN_PREVIEW }}",
    ),
  );
  assert.match(
    previewWorkflow,
    /github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u,
  );
  assert.match(previewWorkflow, /CI_SECRET_PROVIDER_TOKEN_PREVIEW/u);
  assert.match(
    securityWorkflow,
    /github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u,
  );
  assert.match(
    cleanupWorkflow,
    /uses: webpresso\/github-actions\/\.github\/workflows\/wp-cleanup-preview\.yml@[0-9a-f]{40}/u,
  );
  assert.match(cleanupWorkflow, /CI_SECRET_PROVIDER_TOKEN_PREVIEW/u);
});
