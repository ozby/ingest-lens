import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const workflowsDirectory = ".github/workflows";
const workflowFiles = readdirSync(workflowsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
  .map((entry) => join(workflowsDirectory, entry.name))
  .sort();
const workflow = readFileSync(join(workflowsDirectory, "ci.yml"), "utf8");
const expectedPreviewCallerSha = "ba439b2d66ece6f16d3e7fee34bdee3ac5c987c0";

test("CI workflow exposes wp-check as the branch-protection-facing gate", () => {
  assert.match(workflow, /\n  wp-check:\n/u);
  assert.match(workflow, /name:\s*wp-check/u);
  assert.doesNotMatch(workflow, /\n  check:\n/u);
});

test("CI skips mutation for generated Version Packages merges", () => {
  assert.match(workflow, /!startsWith\(github\.event\.head_commit\.message, 'Version Packages'\)/u);
});

test("every workflow rejects legacy agent-kit installs and mutable setup refs", () => {
  for (const workflowFile of workflowFiles) {
    const contents = readFileSync(workflowFile, "utf8");

    assert.doesNotMatch(contents, /WP_SETUP_AGENT_KIT_VERSION|AGENT_KIT_VERSION/u, workflowFile);
    assert.doesNotMatch(contents, /@webpresso\/agent-kit@/u, workflowFile);
    for (const match of contents.matchAll(
      /webpresso\/agent-kit\/\.github\/actions\/setup-wp@([^\s#]+)/gu,
    )) {
      assert.match(match[1] ?? "", /^[0-9a-f]{40}$/u, workflowFile);
    }
  }
});

test("CI uses setup-owned Webpresso tooling without legacy local setup helpers", () => {
  assert.match(workflow, /uses:\s*webpresso\/agent-kit\/\.github\/actions\/setup-wp@[0-9a-f]{40}/u);
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
    new RegExp(
      `uses: webpresso/github-actions/.github/workflows/cloudflare-preview.yml@${expectedPreviewCallerSha}`,
      "u",
    ),
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
  assert.match(e2eWorkflow, /wp secrets run --sink e2e --profile preview/u);
  assert.doesNotMatch(e2eWorkflow, /\.\/\.github\/actions\/setup-monorepo/u);
  assert.match(e2eWorkflow, /name:\s*Install shared Webpresso CLIs/u);
  assert.match(
    e2eWorkflow,
    /uses: DopplerHQ\/cli-action@cdd4670c26c06688d7afe8ff3b76b1cac918f4da # v4/u,
  );
  assert.match(e2eWorkflow, /vp exec playwright install --with-deps chromium/u);
  assert.match(e2eWorkflow, /vp install --frozen-lockfile/u);
  assert.match(
    previewWorkflow,
    /github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u,
  );
  assert.match(previewWorkflow, /CI_SECRET_PROVIDER_TOKEN_PREVIEW/u);
  assert.match(
    securityWorkflow,
    /github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u,
  );
  assert.match(cleanupWorkflow, /name:\s*cleanup-stale-neon-e2e-branches/u);
  assert.doesNotMatch(cleanupWorkflow, /wp-cleanup-preview\.yml/u);
  assert.match(cleanupWorkflow, /uses: actions\/checkout@[0-9a-f]{40}/u);
  assert.match(cleanupWorkflow, /uses: oven-sh\/setup-bun@[0-9a-f]{40}/u);
  assert.match(
    cleanupWorkflow,
    /uses: DopplerHQ\/cli-action@cdd4670c26c06688d7afe8ff3b76b1cac918f4da # v4/u,
  );
  assert.match(cleanupWorkflow, /wp secrets run --sink e2e --profile preview/u);
  assert.match(cleanupWorkflow, /CI_SECRET_PROVIDER_TOKEN_PREVIEW/u);
});
