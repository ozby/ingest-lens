import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { organization } from "better-auth/plugins";
import { jwt } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb, type Env } from "../db/client";

export interface BetterAuthHandler {
  handler: (req: Request) => Promise<Response>;
}

export function createBetterAuth(env: Env): BetterAuthHandler {
  const db = createDb(env);
  const auth = betterAuth({
    basePath: "/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg" }),
    emailAndPassword: { enabled: true },
    plugins: [bearer(), organization(), jwt()],
    trustedOrigins: [
      "https://dev.ingest-lens.ozby.dev",
      "https://ingest-lens.ozby.dev",
      ...(env.ALLOWED_ORIGIN ? [env.ALLOWED_ORIGIN] : []),
    ],
  });
  return { handler: (req) => auth.handler(req) };
}
