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

test("CI installs caller-pinned Vite Plus through the shared toolchain", () => {
  assert.match(
    workflow,
    /uses: webpresso\/github-actions\/\.github\/actions\/setup-webpresso-toolchain@[0-9a-f]{40}/u,
  );
  assert.match(workflow, /cli-global-packages:\s*"vite-plus @webpresso\/agent-kit"/u);
  assert.match(workflow, /name:\s*Expose wp alias from Vite Plus/u);
  assert.match(workflow, /ln -sf "\$\{vp_bin\}" "\$\{RUNNER_TEMP\}\/webpresso-bin\/wp"/u);
  assert.doesNotMatch(workflow, /voidzero-dev\/setup-vp/u);
  assert.doesNotMatch(workflow, /corepack prepare pnpm@10\.33\.0/u);
});

test("CI preview deploy caller grants OIDC permissions to the shared workflow", () => {
  const deployPreviewJob =
    workflow.match(/\n  deploy-preview:[\s\S]*?\n  mutation:|\n  deploy-preview:[\s\S]*$/u)?.[0] ??
    "";

  assert.match(
    deployPreviewJob,
    /uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
  );
  assert.match(deployPreviewJob, /permissions:[\s\S]*contents:\s*read/u);
  assert.match(deployPreviewJob, /permissions:[\s\S]*packages:\s*read/u);
  assert.match(deployPreviewJob, /permissions:[\s\S]*id-token:\s*write/u);
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
  assert.match(e2eWorkflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u);
  assert.match(e2eWorkflow, /NEON_API_KEY: \$\{\{ secrets\.NEON_API_KEY \}\}/u);
  assert.doesNotMatch(e2eWorkflow, /DOPPLER_TOKEN:/u);
  assert.doesNotMatch(e2eWorkflow, /CI_SECRET_PROVIDER_TOKEN/u);
  assert.match(
    previewWorkflow,
    /github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u,
  );
  assert.match(
    previewWorkflow,
    /uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
  );
  assert.match(
    previewWorkflow,
    /ci_secret_provider_token:\s*\$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u,
  );
  assert.match(previewWorkflow, /secret_profile:\s*preview/u);
  assert.match(
    securityWorkflow,
    /github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u,
  );
  assert.match(cleanupWorkflow, /HAS_DIRECT_NEON_SECRETS/u);
  assert.match(cleanupWorkflow, /NEON_API_KEY: \$\{\{ secrets\.NEON_API_KEY \}\}/u);
  assert.doesNotMatch(cleanupWorkflow, /CI_SECRET_PROVIDER_TOKEN/u);
  assert.doesNotMatch(cleanupWorkflow, /doppler-token:/u);
});

test("e2e workflows invoke the repo-local runner instead of the global wp surface", () => {
  const e2eWorkflow = readFileSync(".github/workflows/e2e.yml", "utf8");
  const e2eActWorkflow = readFileSync(".github/workflows/e2e-act.yml", "utf8");

  for (const workflowText of [e2eWorkflow, e2eActWorkflow]) {
    assert.match(workflowText, /run:\s*bun apps\/e2e\/scripts\/e2e-with-neon\.ts --suite full/u);
    assert.doesNotMatch(workflowText, /run:\s*vp run e2e --suite full/u);
  }
});
