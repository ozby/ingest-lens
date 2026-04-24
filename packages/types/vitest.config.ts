import { nodeConfig } from "@webpresso/vitest-config/node";
import { mergeConfig } from "vite-plus/test/config";

export default mergeConfig(nodeConfig as never, {
  test: {
    include: ["**/*.test.ts"],
  },
});
