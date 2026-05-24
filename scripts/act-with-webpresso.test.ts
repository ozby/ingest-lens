import { describe, expect, it } from "bun:test";

import {
  getActSecretProfile,
  listMissingRequiredSecrets,
  pickAllowedSecrets,
  resolveActSecretProfile,
} from "./act-secret-profile.ts";
import { buildCiActInvocation, getCiActPreset, listCiActPresets } from "./act-with-webpresso.ts";

describe("act secret profiles", () => {
  it("defaults local CI and local E2E workflows to zero injected secrets", () => {
    expect(resolveActSecretProfile({ workflowPath: ".github/workflows/ci.yml" }).id).toBe("none");
    expect(
      resolveActSecretProfile({
        workflowPath: ".github/workflows/testing-e2e-act.yml",
        jobName: "full-suite-local",
      }).id,
    ).toBe("none");
  });

  it("routes Neon maintenance jobs to the control-plane profile", () => {
    expect(
      resolveActSecretProfile({
        workflowPath: ".github/workflows/cleanup-stale-neon-e2e-branches.yml",
        jobName: "cleanup",
      }).id,
    ).toBe("neon-control-plane");
  });

  it("filters injected secrets down to the allowlist", () => {
    expect(
      pickAllowedSecrets(
        {
          GITHUB_TOKEN: "github-token",
          NEON_API_KEY: "neon-token",
          DOPPLER_TOKEN: "doppler-token",
        },
        getActSecretProfile("neon-control-plane").allowedKeys,
      ),
    ).toEqual({
      NEON_API_KEY: "neon-token",
    });
  });

  it("reports missing required Neon secrets for strict runs", () => {
    expect(
      listMissingRequiredSecrets(
        { NEON_API_KEY: "neon-token" },
        getActSecretProfile("neon-control-plane").requiredKeys,
      ),
    ).toEqual(["NEON_PROJECT_ID", "NEON_PARENT_BRANCH_ID"]);
  });
});

describe("CI act presets", () => {
  it("keeps repo-owned policy as presets only", () => {
    expect(listCiActPresets().map((preset) => [preset.id, preset.workflow, preset.secretProfile.id])).toEqual([
      ["ci", "ci-main", "none"],
      ["e2e", "testing-e2e-act", "none"],
      ["cleanup", "cleanup-stale-neon-e2e-branches", "neon-control-plane"],
      ["list", "ci-main", "none"],
    ]);
  });

  it("builds a public wp ci act invocation instead of raw act args", () => {
    expect(buildCiActInvocation(["cleanup"]).args).toEqual([
      "./scripts/run-webpresso-cli.ts",
      "ci",
      "act",
      "--workflow",
      "cleanup-stale-neon-e2e-branches",
      "--job",
      "cleanup",
      "--env-profile",
      "neon-control-plane",
      "--execute",
    ]);
  });

  it("passes cleanup secret profile to the public helper", () => {
    expect(buildCiActInvocation(["cleanup", "--dry-run"]).args).toContain("neon-control-plane");
  });

  it("allows dry-runs without changing preset ownership", () => {
    expect(buildCiActInvocation(["e2e", "--dry-run"]).args).not.toContain("--execute");
    expect(getCiActPreset("e2e").secretProfile.id).toBe("none");
  });

  it("rejects provider-specific secret files, unsafe helper flags, and profile overrides", () => {
    expect(() => buildCiActInvocation(["cleanup", "--secret-file", "/tmp/secrets"])).toThrow(
      "--secret-file is not accepted",
    );
    for (const flag of ["--chef-token", "--direct", "--allow-host-mutation", "--allow-local-chef-token", "--bind"]) {
      expect(() => buildCiActInvocation(["ci", flag])).toThrow("is not accepted");
    }
    expect(() => buildCiActInvocation(["ci", "--chef-token=top-secret"])).toThrow("is not accepted");
    expect(() => buildCiActInvocation(["ci", "--secret-profile", "neon-control-plane"])).toThrow(
      "refusing override",
    );
  });
});
