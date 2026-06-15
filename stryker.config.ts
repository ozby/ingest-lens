import { baseConfig } from "@webpresso/agent-kit/stryker";

export default {
  ...baseConfig,
  thresholds: {
    high: 0,
    low: 0,
    break: 0,
  },
  vitest: {
    ...(baseConfig as { vitest?: Record<string, unknown> }).vitest,
    configFile: "vitest.config.ts",
  },
};
