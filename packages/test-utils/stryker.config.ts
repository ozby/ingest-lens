import { baseConfig } from "@webpresso/agent-kit/stryker";

export default {
  ...baseConfig,
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
};
