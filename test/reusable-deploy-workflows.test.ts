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
  assert.match(
    workflow,
    /ci_secret_provider_token: \$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u,
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
  assert.match(
    releaseWorkflow,
    /ci_secret_provider_token: \$\{\{ secrets\.CI_SECRET_PROVIDER_TOKEN \}\}/u,
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
    /packages:\s*read/u,
    "release.yml must grant packages:read so cloudflare-production.yml job does not exceed the caller's explicit permissions block",
  );
});
