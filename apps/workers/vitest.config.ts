import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { workersConfig } from "@webpresso/vitest-config/workers";
import { mergeConfig } from "vite-plus/test/config";

export default mergeConfig(workersConfig as never, {
  test: {
    projects: [
      // Node pool — unit tests with mocked DB, queues, and CF bindings.
      // Fast; no Workers runtime overhead.
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/tests/TopicRoom.test.ts"],
        },
      },
      // Workers pool — tests that exercise CF-native globals:
      // WebSocketPair, DurableObjectState, Response with status 101.
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.vitest.toml" } })],
        test: {
          name: "workers",
          include: ["src/tests/TopicRoom.test.ts"],
        },
      },
    ],
  },
});
