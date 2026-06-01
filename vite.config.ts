import { defineConfig } from "vite-plus";

const compactQaFixture = /\.compact-qa\.[a-z]+$/i;

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/*.compact-qa.*"],
  },
  lint: {
    ignorePatterns: ["apps/lab/assets/*.js", "**/*.compact-qa.*"],
    rules: {
      complexity: ["error", { max: 10 }],
    },
  },
  staged: {
    "*.{ts,tsx,js,mjs,cjs}": (files: readonly string[]) => {
      const filtered = files.filter((file) => !compactQaFixture.test(file));
      return filtered.length === 0
        ? []
        : [`vp check --fix ${filtered.map((file) => JSON.stringify(file)).join(" ")}`];
    },
    "!(pnpm-lock).{json,md,yml,yaml}": "vp fmt",
  },
});
