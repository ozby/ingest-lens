import { deleteEphemeralBranch, getNeonConfig } from "../../../packages/neon/src/index.ts";

const branchId = process.argv[2];
if (!branchId) {
  throw new Error("Usage: bun scripts/db-branch-delete.ts <branch-id>");
}

await deleteEphemeralBranch(getNeonConfig(process.env), branchId);
console.log(`Deleted Neon branch ${branchId}`);
