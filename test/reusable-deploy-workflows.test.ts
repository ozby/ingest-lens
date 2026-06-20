import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("production workflow stays manual-only while release.yml delegates Changesets and deploy finalization through the shared reusable shells", () => {
  const workflow = readRepoFile(".github/workflows/deploy-production.yml");
  const releaseWorkflow = readRepoFile(".github/workflows/release.yml");

  // deploy-production.yml must stay manual-only and never be tag-triggered
  assert.doesNotMatch(workflow, /tags:\s*\["v\*"\]/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /release_version:/u);
  assert.match(workflow, /secret_profile:\s*deploy/u);
  assert.match(
    workflow,
    /ci_secret_provider_token:\s*\$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u,
  );

  // release.yml must use the shared Changesets reusable workflow
  assert.match(
    releaseWorkflow,
    new RegExp(
      String.raw`uses: webpresso/github-actions/.github/workflows/changesets-release.yml@[0-9a-f]{40}`,
      "u",
    ),
  );
  assert.match(releaseWorkflow, /version_command: vp run version/u);
  assert.match(releaseWorkflow, /publish_command: vp run release:publish/u);

  // release.yml must use the shared cloudflare-production reusable workflow
  assert.match(
    releaseWorkflow,
    new RegExp(
      String.raw`uses: webpresso/github-actions/.github/workflows/cloudflare-production.yml@[0-9a-f]{40}`,
      "u",
    ),
  );
  assert.match(releaseWorkflow, /secret_profile:\s*deploy/u);
  assert.match(
    releaseWorkflow,
    /ci_secret_provider_token:\s*\$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u,
  );

  // GitHub Actions cannot pass reusable-workflow outputs directly into a second
  // reusable-workflow call's `with:` / `if:`. The `gate` job bridges the two.
  assert.match(releaseWorkflow, /\bgate:/u);
  assert.match(
    releaseWorkflow,
    /should_deploy: \$\{\{ needs\.release\.outputs\.should_deploy \}\}/u,
  );
  assert.match(
    releaseWorkflow,
    /release_version: \$\{\{ needs\.gate\.outputs\.release_version \}\}/u,
  );

  // Permissions must be declared at the top level so the changesets reusable
  // workflow receives contents:write and pull-requests:write (repo default is read-only).
  assert.match(releaseWorkflow, /permissions:/u);
  assert.match(releaseWorkflow, /contents:\s*write/u);
  assert.match(releaseWorkflow, /pull-requests:\s*write/u);
  assert.match(
    releaseWorkflow,
    /packages:\s*write/u,
    "release.yml must grant packages:write so the shared changesets release workflow can publish packages and the downstream deploy call inherits a sufficient caller permission ceiling",
  );
});

test("shared Cloudflare workflow callers grant OIDC permissions", () => {
  const ciWorkflow = readRepoFile(".github/workflows/ci.yml");
  const previewWorkflow = readRepoFile(".github/workflows/deploy-preview.yml");
  const productionWorkflow = readRepoFile(".github/workflows/deploy-production.yml");

  const callerBlocks = [
    ciWorkflow.match(
      /\n  deploy-preview:[\s\S]*?uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
    )?.[0] ?? "",
    previewWorkflow.match(
      /\n  deploy-preview:[\s\S]*?uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
    )?.[0] ?? "",
    previewWorkflow.match(
      /\n  destroy-preview:[\s\S]*?uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
    )?.[0] ?? "",
    productionWorkflow.match(
      /\n  deploy:[\s\S]*?uses: webpresso\/github-actions\/\.github\/workflows\/cloudflare-production\.yml@[0-9a-f]{40}/u,
    )?.[0] ?? "",
  ];

  assert.equal(callerBlocks.length, 4);
  for (const callerBlock of callerBlocks) {
    assert.match(callerBlock, /permissions:[\s\S]*contents:\s*read/u);
    assert.match(callerBlock, /permissions:[\s\S]*packages:\s*read/u);
    assert.match(callerBlock, /permissions:[\s\S]*id-token:\s*write/u);
  }
});

test("Cloudflare reusable workflow callers forward direct deploy secrets", () => {
  const workflows = [
    readRepoFile(".github/workflows/ci.yml"),
    readRepoFile(".github/workflows/deploy-preview.yml"),
    readRepoFile(".github/workflows/deploy-production.yml"),
    readRepoFile(".github/workflows/release.yml"),
  ];

  for (const workflow of workflows) {
    if (!workflow.includes("cloudflare-")) continue;
    assert.match(workflow, /cloudflare_account_id:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/u);
    assert.match(workflow, /cloudflare_api_token:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u);
    assert.match(workflow, /cloudflare_zone_id:\s*\$\{\{ secrets\.CLOUDFLARE_ZONE_ID \}\}/u);
    assert.match(workflow, /neon_api_key:\s*\$\{\{ secrets\.NEON_API_KEY \}\}/u);
    assert.match(workflow, /pulumi_access_token:\s*\$\{\{ secrets\.PULUMI_ACCESS_TOKEN \}\}/u);
    assert.match(workflow, /better_auth_secret:\s*\$\{\{ secrets\.BETTER_AUTH_SECRET \}\}/u);
    assert.match(workflow, /jwt_secret:\s*\$\{\{ secrets\.JWT_SECRET \}\}/u);
    assert.match(workflow, /langfuse_public_key:\s*\$\{\{ secrets\.LANGFUSE_PUBLIC_KEY \}\}/u);
    assert.match(workflow, /langfuse_secret_key:\s*\$\{\{ secrets\.LANGFUSE_SECRET_KEY \}\}/u);
  }
});
