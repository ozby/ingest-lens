import { reactConfig } from "@webpresso/vitest-config/react";
import { mergeConfig } from "vite-plus/test/config";

export default mergeConfig(reactConfig as never, {
  test: {
    environment: "jsdom",
    passWithNoTests: true,
  },
});
