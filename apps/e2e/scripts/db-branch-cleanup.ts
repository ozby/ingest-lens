import { cleanupStaleE2EBranches, getNeonConfig } from "@webpresso/neon-core";

const result = await cleanupStaleE2EBranches(getNeonConfig(process.env));
console.log(JSON.stringify(result, null, 2));
