export interface BindingMapping {
  /** Key in Pulumi stack output JSON */
  pulumiOutput: string;
  /** TOML block header to find, e.g. '[[env.dev.hyperdrive]]' */
  header: string;
  /** Key inside that block to replace, e.g. 'id' or 'bucket_name' */
  key: string;
}

export interface VerifyEntry {
  /** Key in Pulumi stack output JSON */
  pulumiOutput: string;
  /** Pattern to find in final TOML. Use {value} as placeholder. e.g. 'queue = "{value}"' */
  pattern: string;
}

export interface SyncOptions {
  /** Pulumi stack name, used to read outputs via `pulumi stack output --json --stack <name>` */
  stackName: string;
  /** Absolute or relative (from cwd) path to the wrangler.toml to patch */
  wranglerTomlPath: string;
  /** Bindings to patch in-place. Each maps a Pulumi output key → a TOML block header + key. */
  mappings: BindingMapping[];
  /** Optional: verify these values appear verbatim in the patched TOML. Fails loudly if missing. */
  verify?: VerifyEntry[];
  /** If true, don't write — just return what would change. Default: false */
  dryRun?: boolean;
  /** Override the Pulumi outputs instead of running `pulumi stack output`. For testing. */
  stackOutputs?: Record<string, string>;
}

export interface SyncResult {
  changed: boolean;
  patches: Array<{ header: string; key: string; oldValue: string; newValue: string }>;
  verified: Array<{ pulumiOutput: string; pattern: string; found: boolean }>;
}

export interface PreviewCleanupPlan {
  wranglerEnvName: string;
  deleteCommand: string;
  repoCleanupHook?: string;
}
