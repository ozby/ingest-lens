import { describe, expect, it } from "vitest";

import { buildDopplerFetchArgs } from "./doppler";

describe("doppler secret fetch arguments", () => {
  it("uses service-token scope without project/config flags when auth token is provided", () => {
    expect(
      buildDopplerFetchArgs({
        auth: { accessToken: "service-token" },
        scope: { workspace: "node-pubsub", environment: "dev" },
      }),
    ).toEqual(["secrets", "download", "--no-file", "--format", "json", "--silent"]);
  });

  it("uses explicit project/config flags for local configured CLI flows", () => {
    expect(
      buildDopplerFetchArgs({
        scope: { workspace: "node-pubsub", environment: "dev" },
      }),
    ).toEqual([
      "secrets",
      "download",
      "--no-file",
      "--format",
      "json",
      "--silent",
      "--project",
      "node-pubsub",
      "--config",
      "dev",
    ]);
  });
});
