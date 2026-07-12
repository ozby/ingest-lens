import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function object(value: unknown, label: string): Record<string, unknown> {
  assert.equal(typeof value, "object", `${label} must be an object`);
  assert.notEqual(value, null, `${label} must not be null`);
  assert.equal(Array.isArray(value), false, `${label} must not be an array`);
  return value as Record<string, unknown>;
}

test("consumer secret authority uses the schema-v1 Doppler ozby-dev contract", () => {
  const config = readJson(".webpresso/secrets.config.json");
  const provider = object(object(config.providers, "providers").default, "providers.default");
  const profiles = object(config.profiles, "profiles");

  assert.equal(config.schemaVersion, 1);
  assert.deepEqual(
    {
      type: provider.type,
      workspace: provider.workspace,
      project: provider.project,
    },
    {
      type: "doppler",
      workspace: "ozby",
      project: "ozby-dev",
    },
  );
  assert.deepEqual(
    {
      preview: object(profiles.preview, "profiles.preview"),
      production: object(profiles.production, "profiles.production"),
    },
    {
      preview: { provider: "default", environment: "stg" },
      production: { provider: "default", environment: "prd" },
    },
  );
});

test("consumer setup keeps agent-config local and agent-kit out of package dependencies", () => {
  const packageJson = readJson("package.json");
  const devDependencies = object(packageJson.devDependencies, "devDependencies");
  const dependencySections = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ].filter((value) => value !== undefined);

  assert.equal(object(packageJson.scripts, "scripts")["setup:agent"], "wp setup");
  assert.equal(devDependencies["@webpresso/agent-config"], "catalog:");

  for (const dependencySection of dependencySections) {
    assert.equal(
      object(dependencySection, "dependency section")["@webpresso/agent-kit"],
      undefined,
    );
  }
});
