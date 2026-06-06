import type { ExecutionContext } from "@webpresso/runtime-env";

export type SecretFetchMode = "env-map" | "single-secret";

export interface SecretVersionSelector {
  versionId?: string;
  versionStage?: string;
  versionNumber?: string;
}

export interface SecretManagerScope {
  workspace?: string;
  environment?: string;
  path?: string;
  tags?: string[];
  app?: string;
  environmentIds?: string[];
}

export interface SecretManagerAuth {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  profile?: string;
}

export interface SecretManagerCapabilities {
  envMap: boolean;
  singleSecret: boolean;
  versionSelection: boolean;
  hierarchicalPaths: boolean;
  tagFiltering: boolean;
  watchReload: boolean;
  interactiveLogin: boolean;
}

export interface SecretFetchRequest {
  scope?: SecretManagerScope;
  auth?: SecretManagerAuth;
  mode?: SecretFetchMode;
  version?: SecretVersionSelector;
  secretName?: string;
}

export interface SecretManagerAdapter {
  name: string;
  displayName: string;
  capabilities: SecretManagerCapabilities;
  checkAvailability(): Promise<{ available: boolean; detail?: string }>;
  checkAuthentication(options?: { workspace?: string }): Promise<{ authenticated: boolean; detail?: string }>;
  interactiveLogin?(): Promise<void>;
  interactiveSetup?(options?: { workspace?: string }): Promise<void>;
  listWorkspaces?(): Promise<string[]>;
  resolveScopeForExecution?(execution: ExecutionContext): SecretManagerScope;
  fetchSecrets(request: SecretFetchRequest): Promise<Record<string, string>>;
}

export interface SecretManagerRegistry {
  register(adapter: SecretManagerAdapter): void;
  get(name: string): SecretManagerAdapter | undefined;
  has(name: string): boolean;
  names(): string[];
}
