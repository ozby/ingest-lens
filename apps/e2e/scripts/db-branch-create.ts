import { generateBranchName, getNeonConfig, NeonBranchProvider } from "@webpresso/neon-branching";

const config = getNeonConfig(process.env);
const provider = new NeonBranchProvider(config);
const branch = await provider.createBranch({ name: generateBranchName() });

console.log(JSON.stringify(branch, null, 2));
