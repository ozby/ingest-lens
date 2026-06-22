import { describe, expect, it } from "vitest";

import { fetchSelectedSecrets } from "./secret-selection";

describe("secret selection", () => {
  it("trusts the injected CI secret surface without refetching from Doppler", async () => {
    await expect(
      fetchSelectedSecrets({
        env: {
          CLOUDFLARE_API_TOKEN: "cloudflare-token",
          NEON_API_KEY: "neon-token",
        },
      }),
    ).resolves.toEqual({
      CLOUDFLARE_API_TOKEN: "cloudflare-token",
      NEON_API_KEY: "neon-token",
    });
  });
});
