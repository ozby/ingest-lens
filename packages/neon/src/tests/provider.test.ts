import { afterEach, describe, expect, it, vi } from "vitest";
import * as branchesModule from "../branches";
import type { NeonConfig } from "../config";
import { NeonBranchProvider } from "../provider";

const config: NeonConfig = {
  apiKey: "neon-key",
  projectId: "project-id",
  parentBranchId: "parent-branch-id",
  apiBaseUrl: "https://console.neon.tech/api/v2",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NeonBranchProvider", () => {
  describe("createBranch()", () => {
    it("delegates to createEphemeralBranch and returns Branch shape", async () => {
      const createSpy = vi.spyOn(branchesModule, "createEphemeralBranch").mockResolvedValue({
        id: "branch-id",
        name: "e2e/20260101000000-abc1",
        parentId: "parent-branch-id",
        connectionUri: "postgres://branch-uri",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T01:00:00.000Z",
      });

      const provider = new NeonBranchProvider(config);
      const branch = await provider.createBranch({ name: "e2e/test" });

      expect(createSpy).toHaveBeenCalledWith(config, {
        name: "e2e/test",
        ttlHours: undefined,
      });
      expect(branch).toEqual({ id: "branch-id", connectionUri: "postgres://branch-uri" });
    });

    it("converts ttlMs to ttlHours when provided", async () => {
      const createSpy = vi.spyOn(branchesModule, "createEphemeralBranch").mockResolvedValue({
        id: "branch-id",
        name: "e2e/20260101000000-abc1",
        parentId: "parent-branch-id",
        connectionUri: "postgres://branch-uri",
      });

      const provider = new NeonBranchProvider(config);
      await provider.createBranch({ ttlMs: 7_200_000 });

      expect(createSpy).toHaveBeenCalledWith(config, {
        name: undefined,
        ttlHours: 2,
      });
    });

    it("throws when createEphemeralBranch returns no connectionUri", async () => {
      vi.spyOn(branchesModule, "createEphemeralBranch").mockResolvedValue({
        id: "branch-id",
        name: "e2e/20260101000000-abc1",
        parentId: "parent-branch-id",
        connectionUri: undefined,
      });

      const provider = new NeonBranchProvider(config);
      await expect(provider.createBranch()).rejects.toThrow(
        "Neon did not return a connectionUri for the new branch",
      );
    });
  });

  describe("deleteBranch()", () => {
    it("delegates to deleteEphemeralBranch", async () => {
      const deleteSpy = vi
        .spyOn(branchesModule, "deleteEphemeralBranch")
        .mockResolvedValue(undefined);

      const provider = new NeonBranchProvider(config);
      await provider.deleteBranch("branch-id");

      expect(deleteSpy).toHaveBeenCalledWith(config, "branch-id");
    });
  });

  describe("resetBranch()", () => {
    it("throws 'not implemented'", async () => {
      const provider = new NeonBranchProvider(config);
      await expect(provider.resetBranch("branch-id")).rejects.toThrow(
        "NeonBranchProvider.resetBranch: not implemented — Neon reset is destructive",
      );
    });
  });

  describe("getConnectionUri()", () => {
    it("throws 'not implemented'", async () => {
      const provider = new NeonBranchProvider(config);
      await expect(provider.getConnectionUri("branch-id")).rejects.toThrow(
        "NeonBranchProvider.getConnectionUri: not implemented",
      );
    });

    it("throws 'not implemented' when branchId is omitted", async () => {
      const provider = new NeonBranchProvider(config);
      await expect(provider.getConnectionUri()).rejects.toThrow(
        "NeonBranchProvider.getConnectionUri: not implemented",
      );
    });
  });
});
