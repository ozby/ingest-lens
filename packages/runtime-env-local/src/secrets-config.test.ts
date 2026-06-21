import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readSecretsConfig, writeSecretsConfig } from "./secrets-config";

const tempRoots: string[] = [];

function makeTempDir() {
  const root = mkdtempSync(path.join(tmpdir(), "ingest-secrets-config-"));
  mkdirSync(path.join(root, ".webpresso"), { recursive: true });
  tempRoots.push(root);
  return root;
}

describe("runtime-env-local secrets config", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("reads schemaVersion 1 committed metadata", () => {
    const root = makeTempDir();
    writeFileSync(
      path.join(root, ".webpresso", "secrets.config.json"),
      JSON.stringify({
        schemaVersion: 1,
        providers: { default: { type: "doppler", project: "ozby-dev" } },
        projectLabel: "ingest-lens",
        profiles: { preview: { provider: "default", environment: "stg" } },
        sinks: {},
      }),
    );

    expect(readSecretsConfig(root)).toEqual({
      manager: "doppler",
      projectId: "ozby-dev",
      projectLabel: "ingest-lens",
      profiles: { preview: { environment: "stg" } },
    });
  });

  it("reads committed metadata from nested working directories", () => {
    const root = makeTempDir();
    const nested = path.join(root, "apps", "web");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      path.join(root, ".webpresso", "secrets.config.json"),
      JSON.stringify({
        schemaVersion: 1,
        providers: { default: { type: "infisical", project: "ingest-lens" } },
        profiles: {},
        sinks: {},
      }),
    );

    expect(readSecretsConfig(nested)).toEqual({
      manager: "infisical",
      projectId: "ingest-lens",
      profiles: {},
    });
  });

  it("rejects legacy manager/projectId metadata", () => {
    const root = makeTempDir();
    writeFileSync(
      path.join(root, ".webpresso", "secrets.config.json"),
      JSON.stringify({ manager: "doppler", projectId: "ingest-lens" }),
    );

    expect(() => readSecretsConfig(root)).toThrow(/schemaVersion/);
  });

  it("rejects schemaVersion 1 files that also carry legacy metadata", () => {
    const root = makeTempDir();
    writeFileSync(
      path.join(root, ".webpresso", "secrets.config.json"),
      JSON.stringify({
        schemaVersion: 1,
        manager: "doppler",
        projectId: "ingest-lens",
        providers: { default: { type: "doppler", project: "ingest-lens" } },
      }),
    );

    expect(() => readSecretsConfig(root)).toThrow(/legacy manager\/projectId/);
  });

  it("writes schemaVersion 1 metadata", () => {
    const root = makeTempDir();

    writeSecretsConfig(
      {
        manager: "doppler",
        projectId: "ingest-lens",
        projectLabel: "Ingest Lens",
        profiles: { preview: { environment: "stg" } },
      },
      root,
    );

    const written = JSON.parse(
      readFileSync(path.join(root, ".webpresso", "secrets.config.json"), "utf8"),
    );
    expect(written).toEqual({
      schemaVersion: 1,
      providers: { default: { type: "doppler", project: "ingest-lens" } },
      profiles: { preview: { provider: "default", environment: "stg" } },
      sinks: {},
      projectLabel: "Ingest Lens",
    });
  });

  it("rejects invalid project slugs on write", () => {
    const root = makeTempDir();
    expect(() =>
      writeSecretsConfig({ manager: "doppler", projectId: "Ingest Lens" }, root),
    ).toThrow(/valid project slug/);
  });
});
