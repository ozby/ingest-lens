import { getNeonConfig, listE2EBranches } from "../../../packages/neon/src/index.ts";

const branches = await listE2EBranches(getNeonConfig(process.env));
console.log(JSON.stringify(branches, null, 2));
