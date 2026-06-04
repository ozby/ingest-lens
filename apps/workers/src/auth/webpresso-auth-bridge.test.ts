import { describe, expect, it } from "vitest";

import {
  createLocalWebpressoAuthDrizzleMap,
  createLocalWebpressoAuthHost,
} from "./webpresso-auth-bridge";

describe("webpresso auth bridge", () => {
  it("builds the locked Better Auth host config locally", () => {
    const config = createLocalWebpressoAuthHost(
      {
        auth: {
          cookieDomain: ".ingest-lens.ozby.dev",
          trustedOrigins: ["https://ingest-lens.ozby.dev"],
        },
      },
      {
        secret: "secret",
        env: { NODE_ENV: "test" },
      },
    );

    expect(config.basePath).toBe("/auth");
    expect(config.secret).toBe("secret");
    expect(config.trustedOrigins).toContain("https://ingest-lens.ozby.dev");
    expect(config.trustedOrigins).toContain("http://localhost:3000");
    expect(config.plugins).toHaveLength(4);
    expect(config.advanced?.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: ".ingest-lens.ozby.dev",
    });
  });

  it("returns a drizzle schema map with the full lock-28 table set", () => {
    const tables = {
      user: {},
      session: {},
      account: {},
      verification: {},
      organization: {},
      member: {},
      invitation: {},
      jwks: {},
      deviceCode: {},
    };

    expect(createLocalWebpressoAuthDrizzleMap(tables)).toEqual(tables);
  });
});
