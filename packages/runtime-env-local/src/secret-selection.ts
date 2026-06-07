import { detectExecutionContext, type ExecutionContext } from "@webpresso/runtime-env";
import type {
  SecretFetchMode,
  SecretManagerAdapter,
  SecretManagerAuth,
  SecretManagerScope,
  SecretVersionSelector,
} from "./secret-managers/types";

import { secretManagerRegistry } from "./secret-managers/index";
import { readSecretsConfig } from "./secrets-config";

function hasRequiredSecretsInEnv(env: Record<string, string | undefined>): boolean {
  return !!(env.ENCRYPTION_KEY && env.CLOUDFLARE_API_TOKEN);
}

function extractSecretsFromEnv(env: Record<string, string | undefined>): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) secrets[key] = value;
  }
  return secrets;
}

export function getSelectedSecretManagerName(startDir: string = process.cwd()): string | null {
  return readSecretsConfig(startDir)?.manager ?? null;
}

export function getSelectedSecretManagerAdapter(
  startDir: string = process.cwd(),
): SecretManagerAdapter | null {
  const manager = getSelectedSecretManagerName(startDir);
  return manager ? (secretManagerRegistry.get(manager) ?? null) : null;
}

export function getRequiredSecretManagerAdapter(
  startDir: string = process.cwd(),
): SecretManagerAdapter {
  const manager = getSelectedSecretManagerName(startDir);
  if (!manager) throw new Error("No secret manager configured.\nRun: wp config secrets setup");
  const adapter = secretManagerRegistry.get(manager);
  if (!adapter) throw new Error(`Secret manager "${manager}" is not registered.`);
  return adapter;
}

export function resolveGenericSecretManagerToken(
  env: Record<string, string | undefined>,
): string | undefined {
  return env.SECRET_MANAGER_TOKEN;
}

export interface SelectedSecretFetchRequest {
  startDir?: string;
  env?: Record<string, string | undefined>;
  execution?: ExecutionContext;
  scope?: SecretManagerScope;
  auth?: SecretManagerAuth;
  version?: SecretVersionSelector;
  mode?: SecretFetchMode;
  secretName?: string;
}

async function fetchSecretsWithAdapter(
  adapter: SecretManagerAdapter,
  request: SelectedSecretFetchRequest,
): Promise<Record<string, string>> {
  const {
    env = process.env,
    execution,
    scope,
    auth,
    version,
    mode = "env-map",
    secretName,
  } = request;
  if (mode === "env-map" && hasRequiredSecretsInEnv(env)) return extractSecretsFromEnv(env);
  const executionScope = execution ? adapter.resolveScopeForExecution?.(execution) : undefined;
  const effectiveScope = executionScope || scope ? { ...executionScope, ...scope } : undefined;
  return adapter.fetchSecrets({ scope: effectiveScope, auth, mode, version, secretName });
}

function buildSecretScope(
  config: { projectId?: string } | null,
  requestScope?: SecretManagerScope,
): SecretManagerScope | undefined {
  return config?.projectId
    ? { ...requestScope, workspace: requestScope?.workspace ?? config.projectId }
    : requestScope;
}

function buildSecretAuth(
  requestAuth: SecretManagerAuth | undefined,
  effectiveEnv: Record<string, string | undefined>,
): SecretManagerAuth {
  return {
    ...requestAuth,
    accessToken: requestAuth?.accessToken ?? resolveGenericSecretManagerToken(effectiveEnv),
  };
}

export async function fetchSelectedSecrets(
  request: SelectedSecretFetchRequest = {},
  env: Record<string, string | undefined> = process.env,
): Promise<Record<string, string>> {
  const effectiveEnv = request.env ?? env;
  const { startDir = process.cwd() } = request;
  if (hasRequiredSecretsInEnv(effectiveEnv)) return extractSecretsFromEnv(effectiveEnv);
  const config = readSecretsConfig(startDir);
  const adapter = getRequiredSecretManagerAdapter(startDir);
  const scope = buildSecretScope(config, request.scope);
  const auth = buildSecretAuth(request.auth, effectiveEnv);
  return fetchSecretsWithAdapter(adapter, {
    ...request,
    scope,
    env: effectiveEnv,
    auth,
    execution: request.execution ?? detectExecutionContext(effectiveEnv),
  });
}
