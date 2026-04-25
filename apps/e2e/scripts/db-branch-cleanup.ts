import { cleanupStaleE2EBranches, getNeonConfig } from "../../../packages/neon/src/index.ts";

const result = await cleanupStaleE2EBranches(getNeonConfig(process.env));
console.log(JSON.stringify(result, null, 2));
