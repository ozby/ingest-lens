import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

export function isSkippedSecretScanDirectory(name: string): boolean {
  return name === ".git" || name === "node_modules";
}

export function isForbiddenSecretFile(name: string): boolean {
  const isEnvFile = (name === ".env" || /^\.env(?:\..+)?$/.test(name)) && name !== ".env.example";
  return name === ".dev.vars" || /^\.dev\.vars(?:\..+)?$/.test(name) || isEnvFile;
}

export function collectForbiddenSecretFiles(root: string): string[] {
  const forbidden: string[] = [];

  function walk(dir: string): void {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!isSkippedSecretScanDirectory(entry.name)) {
          walk(join(dir, entry.name));
        }
        continue;
      }

      if (entry.isFile() && isForbiddenSecretFile(entry.name)) {
        forbidden.push(relative(root, join(dir, entry.name)));
      }
    }
  }

  walk(root);
  return forbidden.sort();
}
