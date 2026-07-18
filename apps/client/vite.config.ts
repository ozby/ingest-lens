import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const CLIENT_PORT = process.env.CLIENT_PORT ?? env.CLIENT_PORT ?? "3000";
  const API_URL = process.env.API_URL ?? env.API_URL;
  const VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL ?? API_URL;
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(clientRoot, "src"),
        "@repo/ui/components": resolve(
          repoRoot,
          "packages",
          "ui",
          "src",
          "components",
          "index.tsx",
        ),
        "@repo/ui/lib": resolve(repoRoot, "packages", "ui", "src", "lib", "index.tsx"),
      },
    },
    server: {
      port: parseInt(CLIENT_PORT, 10),
    },
    build: {
      rolldownOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react-dom")) {
              return "react-dom";
            }
            if (id.includes("node_modules/react-router")) {
              return "react-router";
            }
            if (id.includes("node_modules/react/")) {
              return "react";
            }
            if (
              id.includes("node_modules/lucide-react") ||
              id.includes("node_modules/sonner") ||
              id.includes("packages/ui/")
            ) {
              return "ui";
            }
            return undefined;
          },
        },
      },
    },
    define: {
      "import.meta.env.API_URL": JSON.stringify(API_URL),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(VITE_API_BASE_URL),
    },
  };
});
