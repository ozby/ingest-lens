import { nodeConfig } from "@webpresso/agent-config/vitest/node";
import { mergeConfig } from "vite-plus/test/config";

export default mergeConfig(nodeConfig as never, {
  test: {
    name: "lab",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
