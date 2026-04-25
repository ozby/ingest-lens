import { getNeonConfig, NeonBranchProvider } from "../../../packages/neon/src/index.ts";

const branchId = process.argv[2];
if (!branchId) {
  throw new Error("Usage: bun scripts/db-branch-delete.ts <branch-id>");
}

const provider = new NeonBranchProvider(getNeonConfig(process.env));
await provider.deleteBranch(branchId);
console.log(`Deleted Neon branch ${branchId}`);
