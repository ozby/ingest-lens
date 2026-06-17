import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: unknown };
if (typeof pkg.version !== "string" || pkg.version.length === 0) {
  throw new Error("package.json must declare a version before syncing release metadata");
}
const metadataPath = join(root, "infra", "release-metadata.production.json");
const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
metadata.releaseVersion = pkg.version;
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
