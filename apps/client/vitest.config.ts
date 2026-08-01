import { reactConfig } from "@webpresso/app-config/vitest/react";
import { mergeConfig } from "vite-plus/test/config";
import { resolve } from "node:path";

const clientRoot = import.meta.dirname;

export default mergeConfig(reactConfig as never, {
  resolve: {
    alias: {
      "@": resolve(clientRoot, "src"),
    },
  },
  test: {
    environment: "jsdom",
  },
});
