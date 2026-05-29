import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // requires CF Workers runtime (WebSocketPair, DurableObjectState) — not available in standard Node.js pool
      "src/tests/TopicRoom.test.ts",
      "src/**/*.compact-qa.*",
    ],
  },
});
