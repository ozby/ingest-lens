import { describe, expect, it } from "bun:test";

import {
  extractAbsoluteFileDependencyDirectories,
  injectContainerMountArgs,
  injectDefaultActArgs,
  normalizeActSecrets,
  normalizeActSecretsWithOptions,
  parseDopplerSource,
  renderSecretsFile,
} from "./act-with-doppler.ts";

describe("parseDopplerSource", () => {
  it("parses project and config", () => {
    expect(parseDopplerSource("ozby-shell:dev")).toEqual({
      project: "ozby-shell",
      config: "dev",
    });
  });

  it("rejects malformed specs", () => {
    expect(() => parseDopplerSource("ozby-shell")).toThrow(
      'Invalid Doppler source "ozby-shell". Expected <project>:<config>.',
    );
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
