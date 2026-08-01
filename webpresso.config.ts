import { DEPLOY_DOMAIN, PREVIEW_API_SECRET_NAMES } from "./infra/src/deploy/lanes.ts";

export const webpressoConfig = {
  e2e: {
    hostAdapterModule: "./apps/e2e/src/webpresso-host-adapter.ts",
  },
  deploy: {
    adapterModule: "./infra/src/deploy/webpresso-deploy-adapter.ts",
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
          routeSpec: { pattern: `api.preview-main.${DEPLOY_DOMAIN}` },
          durableObjectBindings: [
            { name: "TOPIC_ROOMS", className: "TopicRoom" },
            { name: "HEAL_STREAM", className: "HealStreamDO" },
          ],
          vars: {
            ALLOWED_ORIGIN: `https://preview-main.${DEPLOY_DOMAIN}`,
          },
          requiredSecrets: [...PREVIEW_API_SECRET_NAMES],
          storageMode: "isolated",
          destroyMode: "wrangler_delete_env",
          productionStrategyDefault: "direct",
        },
        {
          id: "ingest-lens-client",
          type: "single_worker",
          topLevelWorkerName: "ingest-lens-client",
          previewTransport: "custom_domain_env",
          routeSpec: { pattern: `preview-main.${DEPLOY_DOMAIN}` },
          vars: {
            AUTH_PROXY_BASE_URL: `https://api.preview-main.${DEPLOY_DOMAIN}`,
          },
          requiredSecrets: [],
          storageMode: "isolated",
          destroyMode: "wrangler_delete_env",
          productionStrategyDefault: "direct",
        },
      ],
    },
  },
} as const;

export default webpressoConfig;
