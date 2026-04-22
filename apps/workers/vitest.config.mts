import { defineConfig } from "vitest/config";
import { cloudflarePool } from "@cloudflare/vitest-pool-workers";

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
        test: {
          name: "workers",
          include: ["src/tests/TopicRoom.test.ts"],
          pool: cloudflarePool({
            wrangler: { configPath: "./wrangler.toml" },
          }),
        },
      },
    ],
  },
});
