import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("Cloudflare deploy lane contract", () => {
  it("declares dev, preview_main, preview_pr, and release-gated prd lanes for both deployed Workers", async () => {
    const { default: agentKitConfig } = await import("../agent-kit.config");
    const cloudflare = agentKitConfig.deploy.cloudflare;

    expect(cloudflare.lanes.dev).toMatchObject({ wranglerEnvName: "dev" });
    expect(cloudflare.lanes.preview_main).toMatchObject({ wranglerEnvName: "preview-main" });
    expect(cloudflare.lanes.preview_pr).toMatchObject({ wranglerEnvNamePattern: "preview-pr-<n>" });
    expect(cloudflare.lanes.prd).toMatchObject({
      wranglerEnvName: "production",
      deployedWorkerNameMode: "top_level_name",
    });

    expect(cloudflare.targets.map((target) => target.id).sort()).toEqual([
      "ingest-lens-api",
      "ingest-lens-client",
    ]);
  });

  it("deploys main and PRs to preview lanes with PR-close cleanup, not production", () => {
    const workflow = readRepoFile(".github/workflows/deploy.preview.yml");

    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("types: [opened, synchronize, reopened, closed]");
    expect(workflow).toContain("preview-main");
    expect(workflow).toContain("PR_NUMBER: ${{ github.event.pull_request.number }}");
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(workflow).toContain(
      "contains('OWNER,MEMBER,COLLABORATOR', github.event.pull_request.author_association)",
    );
    expect(workflow).toContain("printf 'lane=%s\\n'");
    expect(workflow).toContain("packages: read");
    expect(workflow).toContain("--destroy");
    expect(workflow).not.toContain("deploy:production");
    expect(workflow).not.toContain("--lane prd");
  });

  it("allows production deploy only through release metadata plus an explicit semantic release version", () => {
    const workflow = readRepoFile(".github/workflows/deploy.production.yml");
    const metadata = readRepoFile("infra/release-metadata.production.json");

    expect(workflow).not.toContain("branches: [main]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("release_version:");
    expect(workflow).toContain("if: ${{ github.ref == 'refs/heads/main' }}");
    expect(workflow).toContain("ref: main");
    expect(workflow).toContain("RELEASE_VERSION_INPUT: ${{ inputs.release_version }}");
    expect(workflow).toContain("packages: read");
    expect(workflow).toContain("deploy:production");
    expect(metadata).toContain('"releaseKind": "version_pr"');
    expect(metadata).toContain('"requiredChecks"');
    expect(metadata).toMatch(/"releaseVersion"\s*:\s*"\d+\.\d+\.\d+"/);
  });

  it("rejects production metadata without matching semantic release version", async () => {
    const { validateProductionReleaseMetadata } = await import("../infra/src/deploy/release-gate");

    expect(() =>
      validateProductionReleaseMetadata(
        {
          releaseKind: "version_pr",
          releaseVersion: "1.2.3",
          durableObjectMigration: "none",
          rolloutMode: "direct",
          requiredChecks: ["production-smoke"],
        },
        "1.2.3",
      ),
    ).not.toThrow();
    expect(() =>
      validateProductionReleaseMetadata(
        {
          releaseKind: "version_pr",
          releaseVersion: "1.2.3",
          durableObjectMigration: "none",
          rolloutMode: "direct",
          requiredChecks: ["production-smoke"],
        },
        "1.2.4",
      ),
    ).toThrow(/version mismatch/);
    expect(() =>
      validateProductionReleaseMetadata(
        {
          releaseKind: "change" as "version_pr",
          releaseVersion: "1.2.3",
          durableObjectMigration: "none",
          rolloutMode: "direct",
          requiredChecks: ["production-smoke"],
        },
        "1.2.3",
      ),
    ).toThrow(/releaseKind=version_pr/);
    expect(() =>
      validateProductionReleaseMetadata(
        {
          releaseKind: "version_pr",
          durableObjectMigration: "none",
          rolloutMode: "direct",
          requiredChecks: ["production-smoke"],
        },
        "1.2.3",
      ),
    ).toThrow(/semantic release version/);
  });

  it("keeps production Wrangler env aliases aligned with the deploy contract", () => {
    const workerWrangler = readRepoFile("apps/workers/wrangler.toml");
    const clientWrangler = readRepoFile("apps/client/wrangler.toml");
    const syncScript = readRepoFile("infra/src/deploy/sync-wrangler-ids.ts");
    const deployScript = readRepoFile("infra/src/deploy/deploy.ts");

    expect(workerWrangler).toContain("[env.production]");
    expect(workerWrangler).toContain('name = "ingest-lens"');
    expect(workerWrangler).not.toContain("[env.prd]");
    expect(clientWrangler).toContain("[env.production]");
    expect(clientWrangler).toContain('name = "ingest-lens-client"');
    expect(clientWrangler).not.toContain("[env.prd]");
    expect(syncScript).toContain('stack === "prd" ? "production" : stack');
    expect(deployScript).toContain('const wranglerEnv = isProd ? "production" : stack');
  });

  it("creates and configures the production Pulumi stack from direct deploy secrets", () => {
    const deployScript = readRepoFile("infra/src/deploy/deploy.ts");
    const neonBranches = readRepoFile("infra/src/deploy/neon-branches.ts");

    expect(deployScript).toContain('"stack", "select", "--create", stack');
    expect(deployScript).toContain("getDefaultConnectionUri");
    expect(deployScript).toContain('"ingest-lens:cloudflareAccountId"');
    expect(deployScript).toContain('"ingest-lens:cloudflareZoneId"');
    expect(deployScript).toContain('"ingest-lens:neonConnectionString"');
    expect(neonBranches).toContain("export async function getDefaultConnectionUri");
  });

  it("uses repo-local deploy helpers that can be imported at runtime", async () => {
    const lanes = await import("../infra/src/deploy/lanes");
    const neonBranches = await import("../infra/src/deploy/neon-branches");
    const deployScript = readRepoFile("infra/src/deploy/deploy.ts");
    const previewScript = readRepoFile("infra/src/deploy/deploy-preview.ts");

    expect(lanes.resolvePreviewLane("preview-main").clientHost).toBe(
      "preview-main.ingest-lens.ozby.dev",
    );
    expect(lanes.resolvePreviewLane("preview-pr-42").apiHost).toBe(
      "api.preview-pr-42.ingest-lens.ozby.dev",
    );
    expect(typeof neonBranches.getNeonConfig).toBe("function");
    expect(deployScript).not.toContain("@webpresso/webpresso/db/neon");
    expect(previewScript).not.toContain("@webpresso/webpresso/db/neon");
    expect(previewScript).not.toContain("DEPLOY_DEPLOY_DOMAIN");
  });

  it("aliases shared UI package source for Vite without requiring prebuilt dist artifacts", () => {
    const viteConfig = readRepoFile("apps/client/vite.config.ts");

    expect(viteConfig).toContain("function findRepoRoot");
    expect(viteConfig).toContain('"@repo/ui/components"');
    expect(viteConfig).toContain('"@repo/ui/lib"');
    expect(viteConfig).toContain('"packages"');
    expect(viteConfig).toContain('"ui"');
    expect(viteConfig).toContain('"src"');
  });

  it("creates Neon preview branches with a read-write endpoint before reading connection URIs", () => {
    const neonBranches = readRepoFile("infra/src/deploy/neon-branches.ts");

    expect(neonBranches).toContain('endpoints: [{ type: "read_write" }]');
    expect(neonBranches).toContain("ensureReadWriteEndpoint");
    expect(neonBranches).toContain("createReadWriteEndpoint");
    expect(neonBranches).toContain("endpoint_id: endpointId");
  });

  it("keeps secret values out of deploy runner error messages and argv", () => {
    const deployScript = readRepoFile("infra/src/deploy/deploy.ts");
    const previewScript = readRepoFile("infra/src/deploy/deploy-preview.ts");
    const productionScript = readRepoFile("infra/src/deploy/deploy-production.ts");

    expect(deployScript).not.toContain('[command, ...args].join(" ")');
    expect(previewScript).not.toContain('[command, ...args].join(" ")');
    expect(productionScript).not.toContain('[command, ...args].join(" ")');
    expect(deployScript).not.toContain('"--stdin"');
    expect(previewScript).not.toContain('"--stdin"');
    expect(deployScript).toContain('runWithInput(\n    "pulumi",\n    branch.appDatabaseUrl');
    expect(previewScript).not.toContain('"neonConnectionString", branch.appDatabaseUrl');
    expect(previewScript).not.toContain('"cloudflareAccountId", required.CLOUDFLARE_ACCOUNT_ID');
    expect(previewScript).not.toContain('"cloudflareZoneId", required.CLOUDFLARE_ZONE_ID');
  });

  it("keeps README linked to the architecture contract", () => {
    const readme = readRepoFile("README.md");

    expect(readme).toContain("docs/architecture.md");
    expect(readme).toContain("docs/architecture.contract.json");
  });

  it("renders preview-main and per-PR custom-domain URLs for the API and client", () => {
    const script = readRepoFile("infra/src/deploy/deploy-preview.ts");
    const lanes = readRepoFile("infra/src/deploy/lanes.ts");

    expect(lanes).toContain("api.preview-main.${DEPLOY_DOMAIN}");
    expect(lanes).toContain("preview-main.${DEPLOY_DOMAIN}");
    expect(lanes).toContain("api.preview-pr-${prNumber}.${DEPLOY_DOMAIN}");
    expect(lanes).toContain("preview-pr-${prNumber}.${DEPLOY_DOMAIN}");
    expect(script).toContain('"wrangler",\n          "delete"');
    expect(script).toContain('"pulumi",\n        ["destroy"');
    expect(script).toContain("resolvePreviewLane");
    expect(script).toContain("PREVIEW_API_SECRET_NAMES");
    expect(script).toContain("deleteNeonBranch");
    expect(script).toContain("Neon branch cleanup threw");
    expect(script).toContain("isMissingCleanupTarget");
    expect(script).toContain("Preview cleanup failed");
    expect(script).toContain('"wrangler",\n        "secret",\n        "put"');
    expect(lanes).toContain("BETTER_AUTH_SECRET");
  });
});
