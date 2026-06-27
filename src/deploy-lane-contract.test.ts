import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("keeps standalone preview deploys manual/main/cleanup-only so PR deploys stay behind CI", () => {
    const workflow = readRepoFile(".github/workflows/deploy-preview.yml");
    const ciWorkflow = readRepoFile(".github/workflows/ci.yml");

    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("types: [opened, synchronize, reopened, closed]");
    expect(ciWorkflow).toContain("name: Deploy preview (PR)");
    expect(ciWorkflow).toContain("- wp-check");
    expect(ciWorkflow).toContain("- preview-secret");
    expect(workflow).toMatch(
      /uses: webpresso\/github-actions\/.github\/workflows\/cloudflare-preview\.yml@[0-9a-f]{40}/u,
    );
    expect(workflow).toContain("github.event.pull_request.head.ref != 'changeset-release/main'");
    expect(workflow).toContain('dashed_lane="preview-main"');
    expect(workflow).toContain('lane="preview_main"');
    expect(workflow).toContain("PR_NUMBER: ${{ github.event.pull_request.number }}");
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(workflow).toContain(
      "contains('OWNER,MEMBER,COLLABORATOR', github.event.pull_request.author_association)",
    );
    expect(workflow).toContain("printf 'lane=%s\\n'");
    expect(workflow).toContain("printf 'dashed_lane=%s\\n'");
    expect(workflow).toContain("--destroy");
    expect(workflow).toContain("vp install --frozen-lockfile");
    expect(workflow).toContain("wp lint");
    expect(workflow).not.toContain("setup-monorepo");
  });

  it("allows production deploy only through the changesets release run plus an explicit semantic release version", () => {
    // Production deploys are gated by the Changesets release run: no manual
    // deploy-production.yml and no workflow_dispatch (cloudflare-deploy-contract).
    expect(() => readRepoFile(".github/workflows/deploy-production.yml")).toThrow();

    const workflow = readRepoFile(".github/workflows/release.yml");
    const metadata = readRepoFile("infra/release-metadata.production.json");

    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).not.toContain("release-preflight:");
    expect(workflow).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/u);
    expect(workflow).toMatch(
      /uses: webpresso\/github-actions\/.github\/workflows\/changesets-release\.yml@[0-9a-f]{40}/u,
    );
    expect(workflow).toMatch(
      /uses: webpresso\/github-actions\/.github\/workflows\/cloudflare-production\.yml@[0-9a-f]{40}/u,
    );
    expect(workflow).toContain("if: ${{ needs.gate.outputs.should_deploy == 'true' }}");
    expect(workflow).toContain(
      'bun infra/src/deploy/deploy-production.ts --release-version "${RELEASE_VERSION}"',
    );
    expect(workflow).toContain("release_version: ${{ needs.gate.outputs.release_version }}");
    expect(metadata).toContain('"releaseKind": "version_pr"');
    expect(metadata).toContain('"requiredChecks"');
    expect(metadata).toMatch(/"releaseVersion"\s*:\s*"\d+\.\d+\.\d+"/);
  });

  it("uses a no-secret deploy dry-run plan while keeping production metadata validation in-repo", async () => {
    const { default: adapter } = await import("../infra/src/deploy/agent-kit-deploy-adapter");
    const plan = adapter.createPlan({
      lane: "prd",
      dryRun: true,
    });

    expect(plan.requiredCredentials).toEqual([]);
    expect(plan.steps).toMatchObject([
      {
        id: "deploy-plan-dry-run",
        command: "bun",
      },
    ]);
    expect(plan.steps[0]?.args?.join(" ")).toContain("plan-dry-run.ts");
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

    expect(workerWrangler).toContain("[env.production]");
    expect(workerWrangler).toContain('name = "ingest-lens"');
    expect(workerWrangler).not.toContain("[env.prd]");
    expect(clientWrangler).toContain("[env.production]");
    expect(clientWrangler).toContain('name = "ingest-lens-client"');
    expect(clientWrangler).not.toContain("[env.prd]");
  });

  it("creates and configures the production Pulumi stack from direct deploy secrets", async () => {
    const neonBranches = await import("../infra/src/deploy/neon-branches");

    expect(typeof neonBranches.getDefaultConnectionUri).toBe("function");
    expect(typeof neonBranches.getNeonConfig).toBe("function");
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
    expect(deployScript).not.toContain("@webpresso/framework/db/neon");
    expect(previewScript).not.toContain("@webpresso/framework/db/neon");
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

  it("creates Neon preview branches with a read-write endpoint before reading connection URIs", async () => {
    const { ensureNamedBranch, getNeonConfig } = await import("../infra/src/deploy/neon-branches");
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const responseByRoute = new Map<string, Response>([
      [
        "GET /api/v2/projects/project/branches",
        new Response(JSON.stringify({ branches: [] }), { status: 200 }),
      ],
      [
        "POST /api/v2/projects/project/branches",
        new Response(JSON.stringify({ branch: { id: "branch-1", name: "preview-pr-42" } }), {
          status: 200,
        }),
      ],
      [
        "GET /api/v2/projects/project/branches/branch-1/endpoints",
        new Response(JSON.stringify({ endpoints: [] }), { status: 200 }),
      ],
      [
        "POST /api/v2/projects/project/endpoints",
        new Response(JSON.stringify({ endpoint: { id: "endpoint-1", type: "read_write" } }), {
          status: 200,
        }),
      ],
    ]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ url, method, body });
      const parsedUrl = new URL(url);
      const routeKey = `${method} ${parsedUrl.pathname}`;

      if (parsedUrl.pathname.endsWith("/connection_uri") && method === "GET") {
        return new Response(JSON.stringify({ uri: "postgres://preview" }), { status: 200 });
      }

      const response = responseByRoute.get(routeKey);
      if (response) {
        return response.clone();
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });

    const result = await ensureNamedBranch(
      getNeonConfig({
        NEON_API_KEY: "key",
        NEON_PROJECT_ID: "project",
        NEON_PARENT_BRANCH_ID: "parent",
      }),
      "preview-pr-42",
    );

    expect(result).toEqual({
      id: "branch-1",
      reused: false,
      appDatabaseUrl: "postgres://preview",
    });

    expect(calls[1]?.body).toContain('"endpoints":[{"type":"read_write"}]');
    expect(calls[3]?.body).toContain('"type":"read_write"');
    expect(calls[4]?.url).toContain("endpoint_id=endpoint-1");
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
    expect(previewScript).not.toContain('"neonConnectionString", branch.appDatabaseUrl');
    expect(previewScript).not.toContain('"cloudflareAccountId", required.CLOUDFLARE_ACCOUNT_ID');
    expect(previewScript).not.toContain('"cloudflareZoneId", required.CLOUDFLARE_ZONE_ID');
  });

  it("keeps README linked to the architecture contract", () => {
    const readme = readRepoFile("README.md");

    expect(readme).toContain("docs/architecture.md");
    expect(readme).toContain("docs/architecture.contract.json");
  });

  it("renders preview-main and per-PR custom-domain URLs for the API and client", async () => {
    const lanes = await import("../infra/src/deploy/lanes");

    expect(lanes.resolvePreviewLane("preview-main")).toMatchObject({
      apiHost: "api.preview-main.ingest-lens.ozby.dev",
      clientHost: "preview-main.ingest-lens.ozby.dev",
    });
    expect(lanes.resolvePreviewLane("preview-pr-42")).toMatchObject({
      apiHost: "api.preview-pr-42.ingest-lens.ozby.dev",
      clientHost: "preview-pr-42.ingest-lens.ozby.dev",
    });
  });
});
