import { nodeConfig } from "@webpresso/vitest-config/node";
import { mergeConfig } from "vite-plus/test/config";

export default mergeConfig(nodeConfig as never, {
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["journeys/**/*.e2e.ts"],
  },
});
