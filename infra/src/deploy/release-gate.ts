import { readFileSync } from "node:fs";

export type ProductionReleaseMetadata = {
  releaseKind?: "version_pr" | "manual_hotfix";
  durableObjectMigration?: "none" | "required";
  rolloutMode?: "direct" | "gradual";
  requiredChecks?: string[];
  releaseVersion?: string;
};

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function assertSemanticVersion(version: string | undefined): asserts version is string {
  if (!version || !SEMVER.test(version)) {
    throw new Error(
      `Production deploy requires an explicit semantic release version; received ${version ?? "<missing>"}`,
    );
  }
}

export function readProductionReleaseMetadata(path: string): ProductionReleaseMetadata {
  return JSON.parse(readFileSync(path, "utf8")) as ProductionReleaseMetadata;
}

function assertReleaseKind(metadata: ProductionReleaseMetadata): void {
  if (metadata.releaseKind !== "version_pr") {
    throw new Error(
      `Production deploy requires releaseKind=version_pr; received ${metadata.releaseKind ?? "<missing>"}`,
    );
  }
}

function assertRequiredChecks(metadata: ProductionReleaseMetadata): void {
  if (!Array.isArray(metadata.requiredChecks) || metadata.requiredChecks.length === 0) {
    throw new Error("Production deploy metadata must declare requiredChecks");
  }
}

function assertRolloutMetadata(metadata: ProductionReleaseMetadata): void {
  if (
    metadata.durableObjectMigration !== "none" &&
    metadata.durableObjectMigration !== "required"
  ) {
    throw new Error(
      `Production deploy metadata must declare durableObjectMigration=none|required; received ${metadata.durableObjectMigration ?? "<missing>"}`,
    );
  }
  if (metadata.rolloutMode !== "direct" && metadata.rolloutMode !== "gradual") {
    throw new Error(
      `Production deploy metadata must declare rolloutMode=direct|gradual; received ${metadata.rolloutMode ?? "<missing>"}`,
    );
  }
  if (metadata.durableObjectMigration === "required" && metadata.rolloutMode !== "direct") {
    throw new Error("Durable Object migration releases must use rolloutMode=direct");
  }
}

function assertMatchingReleaseVersion(
  metadata: ProductionReleaseMetadata,
  requestedVersion: string,
): void {
  assertSemanticVersion(metadata.releaseVersion);
  if (metadata.releaseVersion !== requestedVersion) {
    throw new Error(
      `Production deploy version mismatch: metadata releaseVersion=${metadata.releaseVersion}, requested=${requestedVersion}`,
    );
  }
}

export function validateProductionReleaseMetadata(
  metadata: ProductionReleaseMetadata,
  requestedVersion: string | undefined,
): void {
  assertSemanticVersion(requestedVersion);
  assertReleaseKind(metadata);
  assertRequiredChecks(metadata);
  assertRolloutMetadata(metadata);
  assertMatchingReleaseVersion(metadata, requestedVersion);
}
