import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createWebpressoAuthHost } from "@webpresso/webpresso/auth/server";
import { createWebpressoAuthDrizzleMap } from "@webpresso/webpresso/auth/schema";
import { hashPasswordAsync, verifyPassword } from "./crypto";
import { createDb, type Env } from "../db/client";
import * as schema from "../db/schema";

export interface BetterAuthHandler {
  handler: (req: Request) => Promise<Response>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: { getSession: (opts: any) => Promise<unknown> };
}

function toDomainUsername(name: string, id: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "user"}-${id.slice(0, 8)}`;
}

export function createBetterAuth(env: Env): BetterAuthHandler {
  const db = createDb(env);
  const baseURL = `${env.ALLOWED_ORIGIN ?? "http://127.0.0.1:8787"}/auth`;

  // Framework host kit: plugin bundle (bearer, organization, deviceAuthorization, jwt),
  // basePath, crossSubDomainCookies, and trustedOrigins from manifest + env.
  const hostConfig = createWebpressoAuthHost(
    {
      auth: {
        cookieDomain: ".ingest-lens.ozby.dev",
        trustedOrigins: [
          "https://dev.ingest-lens.ozby.dev",
          "https://ingest-lens.ozby.dev",
          ...(env.ALLOWED_ORIGIN ? [env.ALLOWED_ORIGIN] : []),
        ],
      },
    },
    { secret: env.BETTER_AUTH_SECRET ?? "" },
  );

  const auth = betterAuth({
    ...hostConfig,
    baseURL,
    // App-local: Drizzle adapter with ingest-lens schema table mapping
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: createWebpressoAuthDrizzleMap({
        user: schema.authUsers,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
        organization: schema.authOrganizations,
        member: schema.authMembers,
        invitation: schema.authInvitations,
        jwks: schema.authJwks,
        deviceCode: schema.authDeviceCodes,
      }),
    }),
    // App-local: mirror newly created auth users into the domain users table
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await db
              .insert(schema.users)
              .values({
                id: user.id,
                username: toDomainUsername(user.name, user.id),
                email: user.email,
                password: `better-auth-managed:${user.id}`,
              })
              .onConflictDoNothing();
          },
        },
      },
    },
    // App-local: custom PBKDF2 password hash/verify (policy — do not remove)
    emailAndPassword: {
      enabled: true,
      password: {
        hash: hashPasswordAsync,
        verify: async ({ hash, password }) => verifyPassword(password, hash),
      },
    },
  });

  return { handler: (req) => auth.handler(req), api: auth.api };
}
