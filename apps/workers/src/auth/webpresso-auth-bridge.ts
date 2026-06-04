import { bearer, deviceAuthorization, jwt, organization } from "better-auth/plugins";

export interface WebpressoAuthEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_SECRETS?: string;
  AUTH_SECRET?: string;
  WEBPRESSO_ALLOWED_HOSTS?: string;
  WEBPRESSO_TRUSTED_ORIGINS?: string;
  WEBPRESSO_COOKIE_DOMAIN?: string;
  NODE_ENV?: string;
}

export interface WebpressoAuthManifest {
  auth?: {
    cookieDomain?: string;
    trustedOrigins?: string[];
    basePath?: string;
  };
  deploy?: {
    urls?: string[];
  };
}

export interface WebpressoAuthHostOptions {
  secret: string;
  env?: WebpressoAuthEnv;
}

export interface WebpressoAuthHostConfig {
  basePath: string;
  secret: string;
  trustedOrigins: string[];
  plugins: ReturnType<
    typeof bearer | typeof organization | typeof deviceAuthorization | typeof jwt
  >[];
  advanced?: {
    crossSubDomainCookies?: {
      enabled: boolean;
      domain?: string;
    };
  };
}

export type DrizzleTable = object;

export interface WebpressoAuthSchema {
  user: DrizzleTable;
  session: DrizzleTable;
  account: DrizzleTable;
  verification: DrizzleTable;
  organization: DrizzleTable;
  member: DrizzleTable;
  invitation: DrizzleTable;
  jwks: DrizzleTable;
  deviceCode: DrizzleTable;
}

function resolveTrustedOrigins(manifest: WebpressoAuthManifest, env: WebpressoAuthEnv): string[] {
  const trustedOrigins: string[] = [...(manifest.auth?.trustedOrigins ?? [])];
  if (env.WEBPRESSO_TRUSTED_ORIGINS) {
    for (const origin of env.WEBPRESSO_TRUSTED_ORIGINS.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) trustedOrigins.push(trimmed);
    }
  }
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    trustedOrigins.push("http://localhost:3000");
  }
  return trustedOrigins;
}

function resolveAdvancedConfig(
  manifest: WebpressoAuthManifest,
  env: WebpressoAuthEnv,
): WebpressoAuthHostConfig["advanced"] | undefined {
  const cookieDomain = manifest.auth?.cookieDomain ?? env.WEBPRESSO_COOKIE_DOMAIN;
  if (!cookieDomain) return undefined;

  return {
    crossSubDomainCookies: {
      enabled: true,
      domain: cookieDomain,
    },
  };
}

export function createLocalWebpressoAuthHost(
  manifest: WebpressoAuthManifest,
  options: WebpressoAuthHostOptions,
): WebpressoAuthHostConfig {
  const { secret, env = {} } = options;
  const basePath = manifest.auth?.basePath ?? "/auth";
  const trustedOrigins = resolveTrustedOrigins(manifest, env);
  const advanced = resolveAdvancedConfig(manifest, env);

  return {
    basePath,
    secret,
    trustedOrigins,
    plugins: [
      bearer(),
      organization({ teams: { enabled: false } }),
      deviceAuthorization({ schema: {} }),
      jwt(),
    ],
    ...(advanced ? { advanced } : {}),
  };
}

export function createLocalWebpressoAuthDrizzleMap(
  tables: WebpressoAuthSchema,
): WebpressoAuthSchema {
  return {
    user: tables.user,
    session: tables.session,
    account: tables.account,
    verification: tables.verification,
    organization: tables.organization,
    member: tables.member,
    invitation: tables.invitation,
    jwks: tables.jwks,
    deviceCode: tables.deviceCode,
  };
}
