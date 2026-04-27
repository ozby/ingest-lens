import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateBranchName,
  getNeonConfig,
  isNeonAvailable,
  listE2EBranches,
  NeonBranchProvider,
} from "@webpresso/neon-core";

const NEON_API_KEY = process.env.NEON_API_KEY;

if (!isNeonAvailable(process.env)) {
  describe.skip("NeonBranchProvider E2E (NEON_API_KEY absent — skipped)", () => {
    it("skipped", () => {});
  });
} else {
  const config = getNeonConfig(process.env);
  const provider = new NeonBranchProvider(config);

  let createdBranchId: string | undefined;

  describe("NeonBranchProvider E2E", () => {
    beforeAll(() => {
      if (!NEON_API_KEY) throw new Error("NEON_API_KEY must be set");
    });

    afterAll(async () => {
      if (createdBranchId) {
        await provider.deleteBranch(createdBranchId).catch(() => {});
      }
    });

    it("creates a branch via NeonBranchProvider and returns a connectionUri", async () => {
      const branch = await provider.createBranch({
        name: generateBranchName(),
        ttlMs: 3_600_000,
      });

      expect(branch.id).toBeTruthy();
      expect(branch.connectionUri).toMatch(/^postgres(ql)?:\/\//u);
      createdBranchId = branch.id;
    });

    it("deletes the branch via NeonBranchProvider", async () => {
      expect(createdBranchId).toBeTruthy();
      await provider.deleteBranch(createdBranchId!);
      createdBranchId = undefined;
    });

    it("verifies no orphan branches remain after delete", async () => {
      const branches = await listE2EBranches(config);
      const orphan = branches.find((b) => b.id === createdBranchId);
      expect(orphan).toBeUndefined();
    });
  });
}
