import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("package scripts and changeset config expose the shared release surface", () => {
  const pkg = JSON.parse(readRepoFile("package.json")) as {
    version: string;
    scripts: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u);
  assert.equal(pkg.scripts["changeset"], "changeset");
  assert.equal(pkg.scripts["changeset:status"], "changeset status");
  assert.equal(
    pkg.scripts["version"],
    "changeset version && bun scripts/sync-release-metadata-version.ts",
  );
  assert.equal(pkg.scripts["release:publish"], "bun scripts/release-publish.ts");
  assert.ok(pkg.devDependencies?.["@changesets/cli"]);
  assert.match(readRepoFile(".changeset/config.json"), /"privatePackages"/u);
});

test("release is changesets-only and gates production deploy on the changesets output", () => {
  const releaseWorkflow = readRepoFile(".github/workflows/release.yml");

  // Production deploys are gated by the Changesets release run, not a manual
  // workflow_dispatch or a release-preflight pre-check (cloudflare-deploy-contract).
  assert.ok(!existsSync(join(repoRoot, ".github/workflows/deploy-production.yml")));
  assert.doesNotMatch(releaseWorkflow, /release-preflight:/u);
  assert.doesNotMatch(releaseWorkflow, /workflow_dispatch:/u);
  assert.match(releaseWorkflow, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/u);
  assert.match(releaseWorkflow, /changesets-release\.yml@[0-9a-f]{40}/u);
  assert.match(releaseWorkflow, /cloudflare-production\.yml@[0-9a-f]{40}/u);
  assert.match(releaseWorkflow, /needs\.gate\.outputs\.should_deploy == 'true'/u);
});

test("production release workflow uses schema-v1 secret profiles and lane-specific provider tokens", () => {
  const releaseWorkflow = readRepoFile(".github/workflows/release.yml");

  assert.match(releaseWorkflow, /secret_profile:\s*production/u);
  assert.match(
    releaseWorkflow,
    /ci_secret_provider_token:\s*\$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN_PRODUCTION \}\}/u,
  );
  assert.doesNotMatch(
    releaseWorkflow,
    new RegExp(
      String.raw`ci_secret_provider_token:\s*\$\{\{ secrets\.` +
        `CI_SECRET_PROVIDER_` +
        `TOKEN` +
        String.raw` \}\}`,
      "u",
    ),
  );
  assert.doesNotMatch(releaseWorkflow, new RegExp("cloudflare_" + "api_token:", "u"));
  assert.match(releaseWorkflow, /wp audit cloudflare-deploy-contract/u);
  assert.match(releaseWorkflow, /vp run verify:secrets/u);
});

test("preview workflows use preview profile and preview provider token only", () => {
  const ciWorkflow = readRepoFile(".github/workflows/ci.yml");
  const previewWorkflow = readRepoFile(".github/workflows/deploy-preview.yml");
  const e2eWorkflow = readRepoFile(".github/workflows/e2e.yml");
  const cleanupWorkflow = readRepoFile(".github/workflows/cleanup-stale-neon-e2e-branches.yml");

  for (const text of [ciWorkflow, previewWorkflow, e2eWorkflow, cleanupWorkflow]) {
    if (!text.includes("ci_secret_provider_token")) continue;
    assert.match(
      text,
      /ci_secret_provider_token:\s*\$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN_PREVIEW \}\}/u,
    );
    assert.doesNotMatch(
      text,
      new RegExp(
        String.raw`ci_secret_provider_token:\s*\$\{\{ secrets\.` +
          `CI_SECRET_PROVIDER_` +
          `TOKEN` +
          String.raw` \}\}`,
        "u",
      ),
    );
    assert.doesNotMatch(text, new RegExp("cloudflare_" + "api_token:", "u"));
  }

  assert.match(previewWorkflow, /secret_profile:\s*preview/u);
  assert.ok(
    e2eWorkflow.includes(
      "CI_SECRET_PROVIDER_TOKEN: ${{ secrets.CI_SECRET_PROVIDER_TOKEN_PREVIEW }}",
    ),
  );
  assert.ok(
    cleanupWorkflow.includes(
      "CI_SECRET_PROVIDER_TOKEN: ${{ secrets.CI_SECRET_PROVIDER_TOKEN_PREVIEW }}",
    ),
  );
  assert.match(cleanupWorkflow, /wp secrets run --sink e2e --profile preview/u);
});

test("shared Cloudflare workflow callers grant OIDC permissions", () => {
  const ciWorkflow = readRepoFile(".github/workflows/ci.yml");
  const previewWorkflow = readRepoFile(".github/workflows/deploy-preview.yml");

  const callerBlocks = [
    ciWorkflow.match(
      /\n  deploy-preview:[\s\S]*?uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
    )?.[0] ?? "",
    previewWorkflow.match(
      /\n  preview:[\s\S]*?uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
    )?.[0] ?? "",
    previewWorkflow.match(
      /\n  destroy:[\s\S]*?uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
    )?.[0] ?? "",
  ];

  assert.equal(callerBlocks.length, 3);
  for (const callerBlock of callerBlocks) {
    assert.match(callerBlock, /permissions:[\s\S]*contents:\s*read/u);
    assert.match(callerBlock, /permissions:[\s\S]*packages:\s*read/u);
    assert.match(callerBlock, /permissions:[\s\S]*id-token:\s*write/u);
  }

  // The production deploy now lives in release.yml and inherits the
  // workflow-level permissions, which must grant OIDC for cloudflare-production.
  const releaseWorkflow = readRepoFile(".github/workflows/release.yml");
  assert.match(releaseWorkflow, /cloudflare-production\.yml@[0-9a-f]{40}/u);
  assert.match(releaseWorkflow, /permissions:[\s\S]*id-token:\s*write/u);
  assert.match(releaseWorkflow, /permissions:[\s\S]*packages:\s*write/u);
});
