import { getNeonConfig, listE2EBranches } from "../src/neon-branches";

const branches = await listE2EBranches(getNeonConfig(process.env));
console.log(JSON.stringify(branches, null, 2));
