import { collectForbiddenSecretFiles } from "../src/secret-file-policy.js";

const root = process.cwd();
const forbidden = collectForbiddenSecretFiles(root);

if (forbidden.length > 0) {
  console.error(
    "ERROR: forbidden .dev.vars or .env files detected. Secrets must be managed by secret providers, not written to disk:",
  );
  for (const file of forbidden) {
    console.log(file);
  }
  process.exit(1);
}

console.log("OK: no forbidden .dev.vars or .env files present in repo working tree");
