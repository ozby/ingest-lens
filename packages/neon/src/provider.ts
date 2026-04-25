import type { Branch, BranchConfig, BranchProvider } from "@webpresso/db-branching";
import { createEphemeralBranch, deleteEphemeralBranch } from "./branches.ts";
import type { NeonConfig } from "./config.ts";

export class NeonBranchProvider implements BranchProvider {
  constructor(private readonly config: NeonConfig) {}

  async createBranch(config?: BranchConfig): Promise<Branch> {
    const branch = await createEphemeralBranch(this.config, {
      name: config?.name,
      ttlHours: config?.ttlMs !== undefined ? config.ttlMs / 3_600_000 : undefined,
    });

    const uri = branch.connectionUri;
    if (!uri) {
      throw new Error("Neon did not return a connectionUri for the new branch");
    }

    return { id: branch.id, connectionUri: uri };
  }

  async deleteBranch(branchId: string): Promise<void> {
    await deleteEphemeralBranch(this.config, branchId);
  }

  async resetBranch(_branchId: string): Promise<void> {
    throw new Error("NeonBranchProvider.resetBranch: not implemented — Neon reset is destructive");
  }

  async getConnectionUri(_branchId?: string): Promise<string> {
    throw new Error("NeonBranchProvider.getConnectionUri: not implemented");
  }
}
