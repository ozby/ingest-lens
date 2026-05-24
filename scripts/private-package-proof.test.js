import { describe, expect, it } from "bun:test";

import {
  discoverPrivatePackageTarballs,
  renderNpmrc,
  verifyPackageTarballs,
} from "../.github/actions/detect-webpresso-package-token/private-package-proof.mjs";

const LOCKFILE_FIXTURE = `
packages:
  '@webpresso/agent-kit@0.18.8':
    resolution: {integrity: sha512-a, tarball: https://npm.pkg.github.com/download/@webpresso/agent-kit/0.18.8/aaa}
  '@ozby/wrangler-sync@0.1.0':
    resolution: {integrity: sha512-b, tarball: https://npm.pkg.github.com/download/@ozby/wrangler-sync/0.1.0/bbb}
  '@types/node@25.6.0':
    resolution: {integrity: sha512-c}
`;

describe("private package lockfile proof", () => {
  it("discovers every private @webpresso/@ozby tarball from the lockfile", () => {
    expect(discoverPrivatePackageTarballs(LOCKFILE_FIXTURE)).toEqual([
      {
        name: "@ozby/wrangler-sync",
        version: "0.1.0",
        tarballUrl: "https://npm.pkg.github.com/download/@ozby/wrangler-sync/0.1.0/bbb",
      },
      {
        name: "@webpresso/agent-kit",
        version: "0.18.8",
        tarballUrl: "https://npm.pkg.github.com/download/@webpresso/agent-kit/0.18.8/aaa",
      },
    ]);
  });


  it("treats public-only lockfiles as no-op package proof", () => {
    expect(discoverPrivatePackageTarballs("packages:\n  'left-pad@1.3.0': {}\n")).toEqual([]);
  });

  it("renders the same registry/token config used by CI install", () => {
    expect(renderNpmrc("token-value")).toContain("@webpresso:registry=https://npm.pkg.github.com");
    expect(renderNpmrc("token-value")).toContain("@ozby:registry=https://npm.pkg.github.com");
    expect(renderNpmrc("token-value")).toContain("//npm.pkg.github.com/:_authToken=token-value");
  });

  it("proves packages through npm registry config rather than direct tarball fetch", async () => {
    const calls = [];
    const failures = await verifyPackageTarballs(
      discoverPrivatePackageTarballs(LOCKFILE_FIXTURE),
      "token-value",
      (command, args, options) => {
        calls.push({ command, args, userconfig: options.env.NPM_CONFIG_USERCONFIG });
        const spec = args[1];
        return { ok: !String(spec).includes("agent-kit"), output: "" };
      },
    );

    expect(failures).toEqual(["@webpresso/agent-kit@0.18.8 (view failed)"]);
    expect(calls.every((call) => call.command === "npm")).toBe(true);
    expect(calls.every((call) => call.args.includes("--registry=https://npm.pkg.github.com"))).toBe(true);
    expect(calls.every((call) => call.userconfig)).toBe(true);
  });
});
