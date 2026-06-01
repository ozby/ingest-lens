export const agentKitConfig = {
  e2e: {
    hostAdapterModule: "./apps/e2e/src/agent-kit-host-adapter.ts",
  },
  deploy: {
    cloudflare: {
      lanes: {
        dev: { wranglerEnvName: "dev" },
        preview_main: { wranglerEnvName: "preview-main" },
        preview_pr: { wranglerEnvNamePattern: "preview-pr-<n>" },
        prd: {
          wranglerEnvName: "production",
          deployedWorkerNameMode: "top_level_name",
        },
      },
      production: {
        metadataPath: "infra/release-metadata.production.json",
      },
      targets: [
        {
          id: "ingest-lens-api",
          type: "single_worker",
          topLevelWorkerName: "ingest-lens",
          previewTransport: "custom_domain_env",
          routeSpec: { pattern: "api.preview-main.ingest-lens.ozby.dev" },
          durableObjectBindings: [
            { name: "TOPIC_ROOMS", className: "TopicRoom" },
            { name: "HEAL_STREAM", className: "HealStreamDO" },
          ],
          vars: {
            ALLOWED_ORIGIN: "https://preview-main.ingest-lens.ozby.dev",
          },
          requiredSecrets: [
            "BETTER_AUTH_SECRET",
            "JWT_SECRET",
            "LANGFUSE_PUBLIC_KEY",
            "LANGFUSE_SECRET_KEY",
          ],
          storageMode: "isolated",
          destroyMode: "wrangler_delete_env",
          productionStrategyDefault: "direct",
        },
      ],
    },
  },
} as const;

export default agentKitConfig;
