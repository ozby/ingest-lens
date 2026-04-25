import {
  createEphemeralBranch,
  generateBranchName,
  getNeonConfig,
} from "../../../packages/neon/src/index.ts";

const config = getNeonConfig(process.env);
const branch = await createEphemeralBranch(config, {
  name: generateBranchName(),
});

console.log(JSON.stringify(branch, null, 2));
