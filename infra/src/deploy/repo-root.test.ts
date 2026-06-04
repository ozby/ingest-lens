import { describe, expect, it } from "vitest";

import { findRepoRoot, resolveVpCommand, resolveWorkspaceBinary } from "./repo-root";

describe("deploy repo-root helpers", () => {
  it("resolves the workspace root and vp binary from the infra deploy surface", () => {
    const repoRoot = findRepoRoot(import.meta.dirname);

    expect(repoRoot).toContain("/ingest-lens");
    expect(resolveWorkspaceBinary(repoRoot, "vp")).toBe(`${repoRoot}/node_modules/.bin/vp`);
    expect(resolveVpCommand(repoRoot)).toBe(`${repoRoot}/node_modules/.bin/vp`);
  });
});
