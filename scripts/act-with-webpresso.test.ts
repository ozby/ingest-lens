import { describe, expect, it, mock } from "bun:test";

import {
  getActSecretProfile,
  listMissingRequiredSecrets,
  pickAllowedSecrets,
  resolveActSecretProfile,
} from "./act-secret-profile.ts";
mock.module("@webpresso/webpresso/runtime/env", () => ({
  resolveRuntimeProfile: async () => ({}),
}));

const {
  applyGithubCliFallback,
  extractAbsoluteFileDependencyDirectories,
  injectContainerMountArgs,
  injectDefaultActArgs,
  normalizeActSecrets,
  normalizeActSecretsWithOptions,
  renderSecretsFile,
  stripPassthroughSentinel,
} = await import("./act-with-webpresso.ts");

describe("act secret profiles", () => {
  it("defaults local CI and local E2E workflows to zero injected secrets", () => {
    expect(
      resolveActSecretProfile({
        workflowPath: ".github/workflows/ci.yml",
      }).id,
    ).toBe("none");
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

  it("routes auth preflight jobs to the GitHub auth profile", () => {
    expect(
      resolveActSecretProfile({
        workflowPath: ".github/workflows/ci.yml",
        jobName: "auth-preflight",
      }).id,
    ).toBe("github-auth-preflight");
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

describe("injectDefaultActArgs", () => {
  it("adds linux/amd64 on Apple silicon when missing", () => {
    expect(injectDefaultActArgs(["-l"], "darwin", "arm64")).toEqual([
      "--container-architecture",
      "linux/amd64",
      "-l",
    ]);
  });

  it("does not duplicate an explicit architecture", () => {
    expect(
      injectDefaultActArgs(["--container-architecture", "linux/arm64", "-l"], "darwin", "arm64"),
    ).toEqual(["--container-architecture", "linux/arm64", "-l"]);
  });
});

describe("stripPassthroughSentinel", () => {
  it("drops a leading package-manager passthrough marker", () => {
    expect(stripPassthroughSentinel(["--", "-j", "auth-preflight"])).toEqual([
      "-j",
      "auth-preflight",
    ]);
  });

  it("preserves ordinary act args", () => {
    expect(stripPassthroughSentinel(["push", "-W", ".github/workflows/ci.yml"])).toEqual([
      "push",
      "-W",
      ".github/workflows/ci.yml",
    ]);
  });
});

describe("applyGithubCliFallback", () => {
  it("hydrates auth-preflight secrets from the GitHub CLI token when missing", () => {
    expect(
      applyGithubCliFallback({}, getActSecretProfile("github-auth-preflight"), "gho_example"),
    ).toEqual({
      GH_PACKAGES_TOKEN: "gho_example",
      GITHUB_TOKEN: "gho_example",
    });
  });

  it("does not override explicit auth-preflight secrets", () => {
    expect(
      applyGithubCliFallback(
        { GITHUB_TOKEN: "explicit-gh", GH_PACKAGES_TOKEN: "explicit-packages" },
        getActSecretProfile("github-auth-preflight"),
        "gho_example",
      ),
    ).toEqual({
      GH_PACKAGES_TOKEN: "explicit-packages",
      GITHUB_TOKEN: "explicit-gh",
    });
  });
});

describe("extractAbsoluteFileDependencyDirectories", () => {
  it("collects unique absolute file dependency parent directories", () => {
    expect(
      extractAbsoluteFileDependencyDirectories([
        {
          dependencies: {
            a: "file:/Users/test/.agent-kit-packs/a.tgz",
            b: "workspace:*",
          },
        },
        {
          devDependencies: {
            c: "file:/Users/test/.agent-kit-packs/c.tgz",
            d: "file:/opt/shared/d.tgz",
          },
        },
      ]),
    ).toEqual(["/Users/test/.agent-kit-packs", "/opt/shared"]);
  });
});

describe("injectContainerMountArgs", () => {
  it("prepends mount flags when no container options exist", () => {
    expect(injectContainerMountArgs(["push"], ["/Users/test/.agent-kit-packs"])).toEqual([
      "--container-options",
      "-v /Users/test/.agent-kit-packs:/Users/test/.agent-kit-packs:ro",
      "push",
    ]);
  });

  it("appends mount flags to existing container options", () => {
    expect(
      injectContainerMountArgs(
        ["--container-options", "--cpus 2", "push"],
        ["/Users/test/.agent-kit-packs"],
      ),
    ).toEqual([
      "--container-options",
      "--cpus 2 -v /Users/test/.agent-kit-packs:/Users/test/.agent-kit-packs:ro",
      "push",
    ]);
  });
});

describe("normalizeActSecrets", () => {
  it("merges sources without aliasing GITHUB_PAT by default", () => {
    expect(
      normalizeActSecrets([{ NEON_API_KEY: "neon-key" }, { GITHUB_PAT: "pat-value" }]),
    ).toEqual({
      GITHUB_PAT: "pat-value",
      NEON_API_KEY: "neon-key",
    });
  });

  it("aliases GITHUB_PAT to GITHUB_TOKEN when explicitly requested", () => {
    expect(
      normalizeActSecretsWithOptions([{ GITHUB_PAT: "pat-value" }], {
        mapGithubPatToToken: true,
      }),
    ).toEqual({
      GITHUB_PAT: "pat-value",
      GITHUB_TOKEN: "pat-value",
    });
  });
});

describe("renderSecretsFile", () => {
  it("renders dotenv-compatible key=value lines", () => {
    expect(
      renderSecretsFile({
        BETA: "two",
        ALPHA: "one",
      }),
    ).toBe('ALPHA="one"\nBETA="two"');
  });
});
