import { readFileSync } from "node:fs";

const source = ".webpresso/secrets.config.json";
const raw = readFileSync(source, "utf8");
const config = JSON.parse(raw) as Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`${source}: ${message}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

if (config.schemaVersion !== 1) fail("schemaVersion must be 1");
if ("manager" in config || "projectId" in config)
  fail("legacy manager/projectId metadata is rejected");

const provider = object(object(config.providers, "providers").default, "providers.default");
if (provider.type !== "doppler" && provider.type !== "infisical")
  fail("providers.default.type is invalid");
if (typeof provider.project !== "string" || !/^[a-z0-9][a-z0-9_-]{0,62}$/u.test(provider.project)) {
  fail("providers.default.project must be a valid project slug");
}

const profiles = object(config.profiles, "profiles");
for (const required of ["preview", "production"]) {
  const profile = object(profiles[required], `profiles.${required}`);
  if (profile.provider !== "default") fail(`profiles.${required}.provider must be default`);
  const expectedEnvironment = required === "preview" ? "stg" : "prd";
  if (profile.environment !== expectedEnvironment) {
    fail(`profiles.${required}.environment must be ${expectedEnvironment}`);
  }
}

const sinks = object(config.sinks, "sinks");
for (const [sinkName, sinkValue] of Object.entries(sinks)) {
  const sink = object(sinkValue, `sinks.${sinkName}`);
  if (sink.defaultProfile !== "preview" && sink.defaultProfile !== "production") {
    fail(`sinks.${sinkName}.defaultProfile must be preview or production`);
  }
  if (
    !Array.isArray(sink.allowedOps) ||
    sink.allowedOps.some((op) => typeof op !== "string" || op.length === 0)
  ) {
    fail(`sinks.${sinkName}.allowedOps must be a non-empty string array`);
  }
}

console.log("schema-v1 secrets config verified");
