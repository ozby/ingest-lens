import { baseConfig } from "@webpresso/agent-kit/stryker";

export default {
  ...baseConfig,
  thresholds: {
    high: 0,
    low: 0,
    break: 0,
  },
  vitest: {
    configFile: "vitest.config.ts",
  },
  mutate: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.d.ts"],
};
