import { reactConfig } from "@webpresso/agent-kit/vitest/react";
import { mergeConfig } from "vite-plus/test/config";

export default mergeConfig(reactConfig as never, {
  test: {
    environment: "jsdom",
  },
});
