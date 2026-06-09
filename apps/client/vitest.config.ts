import { reactConfig } from "@webpresso/agent-kit/vitest/react";
import { mergeConfig } from "vite-plus/test/config";
import { existsSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";

const clientRoot = import.meta.dirname;

function findRepoRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) {
      throw new Error(`Unable to find repo root from ${startDir}`);
    }
    current = parent;
  }
}

const repoRoot = findRepoRoot(clientRoot);

export default mergeConfig(reactConfig as never, {
  resolve: {
    alias: {
      "@": resolve(clientRoot, "src"),
      "@repo/ui/components": resolve(repoRoot, "packages", "ui", "src", "components", "index.tsx"),
      "@repo/ui/lib": resolve(repoRoot, "packages", "ui", "src", "lib", "index.tsx"),
    },
  },
  test: {
    environment: "jsdom",
  },
});
