/**
 * Pure TOML patching utilities — no file I/O, no side effects.
 *
 * Ported and generalised from:
 *   ozby/ingest-lens/infra/src/deploy/sync-wrangler-ids.ts
 */

/**
 * Map an internal deploy lane ID to the Cloudflare-facing Wrangler env name.
 *
 * Internal lane IDs intentionally remain underscore-based for cross-tool
 * consistency. Wrangler env names are derived separately so Cloudflare-facing
 * names are dash-safe.
 */
export function wranglerEnvName(laneId: string): string {
  if (laneId === "prd") {
    return "production";
  }

  if (laneId === "dev") {
    return "dev";
  }

  if (laneId === "preview_main") {
    return "preview-main";
  }

  const previewPrMatch = /^preview_pr_(\d+)$/.exec(laneId);
  if (previewPrMatch) {
    return `preview-pr-${previewPrMatch[1]}`;
  }

  throw new Error(`Unsupported lane ID "${laneId}"`);
}

/**
 * Render a Wrangler TOML custom-domain route block for a specific env.
 */
export function renderEnvCustomDomainRoute(envName: string, pattern: string): string {
  return [`[[env.${envName}.routes]]`, `pattern = "${pattern}"`, "custom_domain = true"].join("\n");
}

export interface TomlDurableObjectBinding {
  name: string;
  className: string;
  scriptName?: string;
}

/**
 * Render a Wrangler TOML Durable Object binding block for a specific env.
 */
export function renderEnvDurableObjectBinding(
  envName: string,
  binding: TomlDurableObjectBinding,
): string {
  const lines = [
    `[[env.${envName}.durable_objects.bindings]]`,
    `name = "${binding.name}"`,
    `class_name = "${binding.className}"`,
  ];

  if (binding.scriptName !== undefined) {
    lines.push(`script_name = "${binding.scriptName}"`);
  }

  return lines.join("\n");
}

/**
 * Upsert an env-specific Durable Object binding for a Wrangler TOML document.
 *
 * If a binding with the same `name` exists in the env, patches class/script
 * fields in place. Otherwise inserts a new binding block immediately after the
 * env block and before nested env tables such as `[env.<name>.vars]`.
 */
export function upsertEnvDurableObjectBinding(
  toml: string,
  envName: string,
  binding: TomlDurableObjectBinding,
): string {
  const bindingHeader = `[[env.${envName}.durable_objects.bindings]]`;
  const existingBlocks = findBlocks(toml, bindingHeader);

  for (const block of existingBlocks) {
    const nameMatch = /(?:^|\n)\s*name\s*=\s*"([^"]*)"/m.exec(block.body);
    if (nameMatch?.[1] !== binding.name) {
      continue;
    }

    let patched = block.body;
    patched = patchBlockValue(patched, "class_name", binding.className);
    if (binding.scriptName !== undefined) {
      patched = patchBlockValue(patched, "script_name", binding.scriptName);
    }
    return toml.slice(0, block.start) + patched + toml.slice(block.end);
  }

  const envBlock = findBlock(toml, `[env.${envName}]`);
  const insertion = `\n\n${renderEnvDurableObjectBinding(envName, binding)}`;
  return toml.slice(0, envBlock.end) + insertion + toml.slice(envBlock.end);
}

/**
 * Upsert the env-specific custom-domain route for a Wrangler TOML document.
 *
 * Supports either of the route shapes already used in nearby repos:
 * - inline env-level array syntax: `routes = [{ pattern = "...", custom_domain = true }]`
 * - array-of-tables syntax: `[[env.<name>.routes]]`
 *
 * If no route exists yet for the env, inserts an `[[env.<name>.routes]]` block
 * immediately before the next header after `[env.<name>]`.
 */
export function upsertEnvCustomDomainRoute(toml: string, envName: string, pattern: string): string {
  const envHeader = `[env.${envName}]`;
  const envBlock = findBlock(toml, envHeader);

  const inlineRoutesRe = /(^|\n)(\s*routes\s*=\s*\[\s*\{[^\n]*?\bpattern\s*=\s*)"[^"]*"/m;
  if (inlineRoutesRe.test(envBlock.body)) {
    const patchedBlock = envBlock.body.replace(inlineRoutesRe, `$1$2"${pattern}"`);
    return toml.slice(0, envBlock.start) + patchedBlock + toml.slice(envBlock.end);
  }

  const routeHeader = `[[env.${envName}.routes]]`;
  if (toml.includes(routeHeader)) {
    return patchEnvBinding(toml, routeHeader, "pattern", pattern);
  }

  const insertion = `\n\n${renderEnvCustomDomainRoute(envName, pattern)}`;
  return toml.slice(0, envBlock.end) + insertion + toml.slice(envBlock.end);
}

/**
 * Locate `header` in `toml`, find `key = "..."` inside that block, and
 * replace the quoted value with `value`.
 *
 * Throws if `header` is not found, or if `key` is not present in the block.
 */
export function patchEnvBinding(toml: string, header: string, key: string, value: string): string {
  const block = findBlock(toml, header);

  const keyRe = new RegExp(`(^|\\n)(\\s*${key}\\s*=\\s*)"[^"]*"`, "m");
  if (!keyRe.test(block.body)) {
    throw new Error(`${header} has no "${key}" line to patch`);
  }

  const patchedBlock = block.body.replace(keyRe, `$1$2"${value}"`);
  return toml.slice(0, block.start) + patchedBlock + toml.slice(block.end);
}

function findBlock(toml: string, header: string): { start: number; end: number; body: string } {
  // Full-path TOML headers like `[[env.dev.hyperdrive]]` are unambiguous in
  // the file, so we search globally rather than scoping to a parent section
  // (sibling sub-tables like `[env.dev.vars]` close the parent, making
  // textual scoping error-prone).
  const blockStart = toml.indexOf(header);
  if (blockStart === -1) {
    throw new Error(`wrangler.toml missing ${header}`);
  }

  // Block ends at the next header of any kind (`\n[` or `\n[[`) or EOF.
  const nextHeader = toml.indexOf("\n[", blockStart + header.length);
  const blockEnd = nextHeader === -1 ? toml.length : nextHeader;

  return {
    start: blockStart,
    end: blockEnd,
    body: toml.slice(blockStart, blockEnd),
  };
}

function findBlocks(
  toml: string,
  header: string,
): Array<{ start: number; end: number; body: string }> {
  const blocks: Array<{ start: number; end: number; body: string }> = [];
  let startIndex = 0;

  while (true) {
    const blockStart = toml.indexOf(header, startIndex);
    if (blockStart === -1) {
      return blocks;
    }

    const nextHeader = toml.indexOf("\n[", blockStart + header.length);
    const blockEnd = nextHeader === -1 ? toml.length : nextHeader;
    blocks.push({
      start: blockStart,
      end: blockEnd,
      body: toml.slice(blockStart, blockEnd),
    });
    startIndex = blockEnd;
  }
}

function patchBlockValue(block: string, key: string, value: string): string {
  const keyRe = new RegExp(`(^|\\n)(\\s*${key}\\s*=\\s*)"[^"]*"`, "m");
  if (keyRe.test(block)) {
    return block.replace(keyRe, `$1$2"${value}"`);
  }

  return `${block}\n${key} = "${value}"`;
}
