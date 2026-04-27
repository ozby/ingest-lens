import { getNeonConfig, listE2EBranches } from "@webpresso/neon";

const branches = await listE2EBranches(getNeonConfig(process.env));
console.log(JSON.stringify(branches, null, 2));
