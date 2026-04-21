import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{ts,tsx,js,mjs,cjs}": "vp check --fix",
    "*.{json,md,yml,yaml}": "vp fmt",
  },
});
