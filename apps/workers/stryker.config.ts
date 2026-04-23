import { baseConfig } from "@webpresso/stryker-config";

export default {
  ...baseConfig,
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
};
