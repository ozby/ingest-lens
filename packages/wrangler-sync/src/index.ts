import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { patchEnvBinding, wranglerEnvName } from "./patch-toml";
import { runPulumiStackOutput } from "./run-pulumi";

import type { PreviewCleanupPlan, SyncOptions, SyncResult } from "./types";

export type {
  BindingMapping,
  PreviewCleanupPlan,
  SyncOptions,
  SyncResult,
  VerifyEntry,
} from "./types";
export {
  patchEnvBinding,
  renderEnvCustomDomainRoute,
  renderEnvDurableObjectBinding,
  upsertEnvCustomDomainRoute,
  upsertEnvDurableObjectBinding,
  wranglerEnvName,
} from "./patch-toml";

/**
 * Read Pulumi stack outputs and patch matching binding lines in `wrangler.toml`
 * in-place.
 *
 * Pass `options.stackOutputs` to skip the real `pulumi` CLI (useful in tests).
 * Pass `options.dryRun = true` to return what would change without writing.
 */
export function syncWranglerBindings(options: SyncOptions): SyncResult {
  const outputs: Record<string, string> =
    options.stackOutputs ?? runPulumiStackOutput(options.stackName);

  const wranglerPath = resolve(options.wranglerTomlPath);
  const original = readFileSync(wranglerPath, "utf8");

  const patches: SyncResult["patches"] = [];
  let current = original;

  for (const mapping of options.mappings) {
    const newValue = outputs[mapping.pulumiOutput];
    if (newValue === undefined) {
      throw new Error(
        `Pulumi output "${mapping.pulumiOutput}" not found in stack "${options.stackName}"`,
      );
    }

    const oldValue = extractCurrentValue(current, mapping.header, mapping.key);
    const patched = patchEnvBinding(current, mapping.header, mapping.key, newValue);

    patches.push({
      header: mapping.header,
      key: mapping.key,
      oldValue,
      newValue,
    });
    current = patched;
  }

  const changed = current !== original;

  if (!options.dryRun && changed) {
    writeFileSync(wranglerPath, current);
  }

  const verified: SyncResult["verified"] = [];
  if (options.verify) {
    for (const entry of options.verify) {
      const value = outputs[entry.pulumiOutput];
      if (value === undefined) {
        throw new Error(`Pulumi output "${entry.pulumiOutput}" not found for verify check`);
      }
      const expected = entry.pattern.replace("{value}", value);
      const found = current.includes(expected);
      verified.push({ pulumiOutput: entry.pulumiOutput, pattern: entry.pattern, found });
      if (!found) {
        throw new Error(`Verification failed: "${expected}" not found in wrangler.toml after sync`);
      }
    }
  }

  return { changed, patches, verified };
}

function extractCurrentValue(toml: string, header: string, key: string): string {
  const blockStart = toml.indexOf(header);
  if (blockStart === -1) return "";
  const nextHeader = toml.indexOf("\n[", blockStart + header.length);
  const blockEnd = nextHeader === -1 ? toml.length : nextHeader;
  const blockBody = toml.slice(blockStart, blockEnd);
  const keyRe = new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*"([^"]*)"`, "m");
  const match = keyRe.exec(blockBody);
  return match?.[1] ?? "";
}

export function derivePreviewHostname(laneId: string, baseDomain: string): string {
  return `${wranglerEnvName(laneId)}.${baseDomain}`;
}

export function buildPreviewCleanupPlan(
  laneId: string,
  repoCleanupHook?: string,
): PreviewCleanupPlan {
  const envName = wranglerEnvName(laneId);
  return {
    wranglerEnvName: envName,
    deleteCommand: `wrangler delete --env ${envName}`,
    repoCleanupHook,
  };
}
