import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const forbidden: string[] = [];

const isSkippedDirectory = (name: string): boolean => name === ".git" || name === "node_modules";

const isForbiddenSecretFile = (name: string): boolean => {
  const isEnvFile = (name === ".env" || /^\.env(?:\..+)?$/.test(name)) && name !== ".env.example";
  return name === ".dev.vars" || /^\.dev\.vars(?:\..+)?$/.test(name) || isEnvFile;
};

function walk(dir: string): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!isSkippedDirectory(entry.name)) {
        walk(join(dir, entry.name));
      }
      continue;
    }

    if (!entry.isFile() || !isForbiddenSecretFile(entry.name)) {
      continue;
    }

    forbidden.push(relative(root, join(dir, entry.name)));
  }
}

walk(root);

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
