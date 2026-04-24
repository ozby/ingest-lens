import { defineAgentKitConfig } from "@webpresso/agent-kit/e2e";

export const agentKitConfig = defineAgentKitConfig({
  e2e: {
    hostAdapterModule: "./apps/e2e/src/agent-kit-host-adapter.ts",
  },
});
