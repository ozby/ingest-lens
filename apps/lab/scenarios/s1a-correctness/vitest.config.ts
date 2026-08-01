import { fileURLToPath } from "node:url";
import { nodeConfig } from "@webpresso/app-config/vitest/node";
import { mergeConfig } from "vite-plus/test/config";

export default mergeConfig(nodeConfig as never, {
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    include: ["test/**/*.test.ts"],
  },
});
