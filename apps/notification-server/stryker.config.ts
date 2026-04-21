import type { Config } from "@stryker-mutator/core";

const config: Config = {
  testRunner: "jest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  mutate: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.spec.ts"],
  thresholds: { high: 80, low: 65, break: 60 },
  incremental: true,
  incrementalFile: ".stryker-incremental.json",
};

export default config;
