import {
  DATABASE_RESOLVER_NAMES,
  FULL_RESOLVER_NAMES,
  RuntimeCoordinator,
  SERVICE_RUNTIME_RESOLVER_NAMES,
  SERVICE_URL_RESOLVER_NAMES,
  getResolverNamesForProfile,
  type ResolverContext,
  type RuntimeProfile,
  type RuntimeResolver,
} from "@webpresso/runtime-env";

import { fetchSelectedSecrets } from "./secret-selection";

export {
  DATABASE_RESOLVER_NAMES,
  FULL_RESOLVER_NAMES,
  SERVICE_RUNTIME_RESOLVER_NAMES,
  SERVICE_URL_RESOLVER_NAMES,
};
export type { ResolverContext, RuntimeProfile, RuntimeResolver };

export const secretsResolver: RuntimeResolver = {
  name: "secrets",
  provides: ["*"],
  priority: 0,
  async resolve(ctx: ResolverContext): Promise<Record<string, string>> {
    try {
      return await fetchSelectedSecrets({
        env: ctx.env,
        execution: ctx.execution,
      });
    } catch (error) {
      if (ctx.execution.type === "e2e") {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[runtime-env-local] Skipping secrets resolution in E2E: ${message}`);
        return {};
      }
      throw error;
    }
  },
};

export const runtimeEnv = new RuntimeCoordinator().register(secretsResolver);

export async function resolveRuntimeProfile(
  profile: RuntimeProfile,
  options?: { fresh?: boolean },
): Promise<Record<string, string>> {
  return runtimeEnv.resolveSelected(getResolverNamesForProfile(profile), options);
}
