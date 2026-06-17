import { describe, expect, it } from "vitest";

import { buildDopplerCommandEnv } from "./doppler";

describe("buildDopplerCommandEnv", () => {
  it("forwards the generic access token as DOPPLER_TOKEN for CLI fetches", () => {
    expect(
      buildDopplerCommandEnv({ accessToken: "secret-manager-token" }, {
        PATH: "/usr/bin",
      } as NodeJS.ProcessEnv),
    ).toMatchObject({
      PATH: "/usr/bin",
      DOPPLER_TOKEN: "secret-manager-token",
    });
  });

  it("leaves the environment unchanged when no access token is provided", () => {
    const env = { PATH: "/usr/bin" } as NodeJS.ProcessEnv;
    expect(buildDopplerCommandEnv({}, env)).toBe(env);
  });
});
