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
const expectedPreviewCallerSha = "8ef11734f666ea86f41a129e634ba68e91638df6";

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

    assert.doesNotMatch(
      contents,
      /^\s*(?:AGENT_KIT_VERSION|WP_SETUP_AGENT_KIT_VERSION)\s*[:=]/mu,
      workflowFile,
    );
    assert.doesNotMatch(contents, /@webpresso\/agent-kit@/u, workflowFile);
    for (const match of contents.matchAll(
      /webpresso\/github-actions\/\.github\/actions\/setup-wp@([^\s#]+)/gu,
    )) {
      assert.match(match[1] ?? "", /^[0-9a-f]{40}$/u, workflowFile);
    }
  }
});

test("wp is installed from the shared action on the public app-releases version line", () => {
  for (const workflowFile of workflowFiles) {
    const contents = readFileSync(workflowFile, "utf8");

    // The repo-local copy read releases from the private pre-rename repository,
    // whose API path now 301s; only the shared public-sourced action installs wp.
    assert.doesNotMatch(contents, /\.\/\.github\/actions\/setup-wp-release/u, workflowFile);

    for (const match of contents.matchAll(
      /uses:\s*webpresso\/github-actions\/\.github\/actions\/setup-wp@[0-9a-f]{40}\n\s*with:\n\s*version:\s*"([^"]+)"/gu,
    )) {
      // The public webpresso/app-releases line restarted at 0.0.x; a 3.x pin
      // resolves to the deprecated npm tombstone that ships no `wp` binary.
      assert.match(match[1] ?? "", /^0\.\d+\.\d+$/u, `${workflowFile}: ${match[1]}`);
    }
  }
});

test("wp installs the package root so on-disk assets resolve", () => {
  for (const workflowFile of workflowFiles) {
    const contents = readFileSync(workflowFile, "utf8");

    const setupCallSites = contents.match(
      /uses:\s*webpresso\/github-actions\/\.github\/actions\/setup-wp@[0-9a-f]{40}/gu,
    );
    if (setupCallSites === null) continue;

    // `bun build --compile` embeds no assets, so a bare release binary has no
    // catalog and no blueprint migrations: `wp audit blueprint-lifecycle` dies
    // with "Missing blueprint migrations at dist/esm/blueprint/db/migrations".
    // The package root ships as a public, tokenless asset on the same release,
    // so every call site opts in.
    const packageRootOptIns = contents.match(/^\s*package-root:\s*true$/gmu) ?? [];
    assert.strictEqual(packageRootOptIns.length, setupCallSites.length, workflowFile);
  }
});

test("CI uses setup-owned Webpresso tooling without legacy local setup helpers", () => {
  assert.match(
    workflow,
    /uses:\s*webpresso\/github-actions\/\.github\/actions\/setup-wp@[0-9a-f]{40}/u,
  );
  assert.match(workflow, /uses: oven-sh\/setup-bun@[0-9a-f]{40}/u);
  assert.doesNotMatch(workflow, /name:\s*Expose wp alias from Vite Plus/u);
  assert.doesNotMatch(workflow, /ln -sf "\$\{vp_bin\}" "\$\{RUNNER_TEMP\}\/webpresso-bin\/wp"/u);
  assert.match(workflow, /wp typecheck/u);
  assert.doesNotMatch(workflow, new RegExp("setup-" + "webpresso-toolchain", "u"));
  assert.match(workflow, /uses:\s*voidzero-dev\/setup-vp@[0-9a-f]{40}/u);
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
  // The e2e job now lives inside ci.yml (needs: [wp-check]) instead of a
  // standalone e2e.yml, so a superseded push cancels the whole workflow run
  // (including e2e) via ci.yml's existing workflow-level concurrency group
  // instead of leaking a fresh Neon branch from an orphaned e2e.yml run.
  const e2eJob = workflow.match(/\n  e2e:\n[\s\S]*?(?=\n  deploy-preview:)/u)?.[0] ?? "";
  const previewWorkflow = readFileSync(".github/workflows/deploy-preview.yml", "utf8");
  const securityWorkflow = readFileSync(".github/workflows/security-scan.yml", "utf8");
  const cleanupWorkflow = readFileSync(
    ".github/workflows/cleanup-stale-neon-e2e-branches.yml",
    "utf8",
  );

  assert.match(e2eJob, /github\.event\.pull_request\.head\.ref != 'changeset-release\/main'/u);
  assert.match(e2eJob, /!startsWith\(github\.event\.head_commit\.message, 'Version Packages'\)/u);
  assert.doesNotMatch(e2eJob, /wp-e2e\.yml/u);
  assert.match(e2eJob, /needs:\s*\[wp-check\]/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(e2eJob, /CI_SECRET_PROVIDER_TOKEN_PREVIEW/u);
  assert.ok(
    e2eJob.includes("CI_SECRET_PROVIDER_TOKEN: ${{ secrets.CI_SECRET_PROVIDER_TOKEN_PREVIEW }}"),
  );
  assert.match(e2eJob, /wp secrets run --sink e2e --profile preview/u);
  assert.doesNotMatch(e2eJob, /\.\/\.github\/actions\/setup-monorepo/u);
  assert.match(e2eJob, /uses:\s*voidzero-dev\/setup-vp@[0-9a-f]{40}/u);
  assert.match(
    e2eJob,
    /uses: DopplerHQ\/cli-action@cdd4670c26c06688d7afe8ff3b76b1cac918f4da # v4/u,
  );
  assert.match(e2eJob, /vp exec playwright install --with-deps chromium/u);
  assert.match(e2eJob, /vp install --frozen-lockfile/u);
  assert.doesNotMatch(previewWorkflow, /types: \[opened, synchronize, reopened, closed\]/u);
  assert.match(previewWorkflow, /types: \[closed\]/u);
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
