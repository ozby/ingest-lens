import { existsSync, readFileSync } from "node:fs";

import packageJson from "../package.json" with { type: "json" };

const FALLBACK_AGENT_KIT_VERSION = "^2.0.2";

function readWorkspaceCatalogVersion(key) {
  const workspace = existsSync("pnpm-workspace.yaml")
    ? readFileSync("pnpm-workspace.yaml", "utf8")
    : "";
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = workspace.match(new RegExp(`^\\s*['"]?${escapedKey}['"]?:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function readDependencyVersion(name) {
  return packageJson.devDependencies?.[name] || packageJson.dependencies?.[name] || "";
}

function resolveCatalogAwareVersion(name) {
  const raw = readDependencyVersion(name);
  if (raw === "catalog:" || raw.startsWith("catalog:")) {
    return readWorkspaceCatalogVersion(name);
  }
  return raw;
}

const agentKitVersion =
  readWorkspaceCatalogVersion("@webpresso/agent-kit") ||
  resolveCatalogAwareVersion("@webpresso/agent-kit") ||
  process.env.WP_SETUP_AGENT_KIT_VERSION ||
  FALLBACK_AGENT_KIT_VERSION;
const vitePlusVersion = resolveCatalogAwareVersion("vite-plus");

console.log(`AGENT_KIT_VERSION=${JSON.stringify(agentKitVersion)}`);
console.log(`VITE_PLUS_VERSION=${JSON.stringify(vitePlusVersion)}`);
