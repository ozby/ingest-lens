import { nodeConfig } from "@webpresso/app-config/vitest/node";
import { mergeConfig } from "vite-plus/test/config";

export default mergeConfig(nodeConfig as never, {
  test: {
    include: ["**/*.test.ts"],
  },
});
