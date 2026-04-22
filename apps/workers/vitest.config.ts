import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // Node pool — unit tests with mocked DB, queues, and CF bindings.
      // Fast; no Workers runtime overhead.
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/tests/**/*.test.ts"],
          exclude: ["src/tests/TopicRoom.test.ts"],
        },
      },
      // Workers pool — tests that exercise CF-native globals:
      // WebSocketPair, DurableObjectState, Response with status 101.
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
        test: {
          name: "workers",
          include: ["src/tests/TopicRoom.test.ts"],
        },
      },
    ],
  },
});
