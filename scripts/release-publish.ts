import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const resultPath = process.env.RELEASE_PUBLISH_RESULT_FILE;
const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name?: unknown;
  version?: unknown;
};
if (typeof pkg.name !== "string" || typeof pkg.version !== "string") {
  throw new Error("package.json must declare name and version before release preparation");
}
const metadata = JSON.parse(
  readFileSync(join(root, "infra", "release-metadata.production.json"), "utf8"),
) as { releaseVersion?: unknown };
if (metadata.releaseVersion !== pkg.version) {
  throw new Error(
    `release metadata version (${String(metadata.releaseVersion)}) does not match package.json version (${pkg.version})`,
  );
}
if (resultPath) {
  writeFileSync(
    resultPath,
    JSON.stringify(
      { packageName: pkg.name, version: pkg.version, publishState: "prepared" },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}
console.log(`[release:publish] prepared ${pkg.name}@${pkg.version}`);
