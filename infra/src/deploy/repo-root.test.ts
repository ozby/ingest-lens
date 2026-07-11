import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import { findRepoRoot, resolveVpCommand, resolveWorkspaceBinary } from "./repo-root";

describe("deploy repo-root helpers", () => {
  it("resolves the workspace root and vp binary from the infra deploy surface", () => {
    const repoRoot = findRepoRoot(import.meta.dirname);

    expect(repoRoot).toBe(resolve(import.meta.dirname, "../../.."));
    expect(resolveWorkspaceBinary(repoRoot, "vp")).toBe(`${repoRoot}/node_modules/.bin/vp`);
    expect(resolveVpCommand(repoRoot)).toBe(`${repoRoot}/node_modules/.bin/vp`);
  });
});
