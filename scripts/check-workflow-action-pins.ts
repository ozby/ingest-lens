import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const RETIRED_LOCAL_SETUP_ACTIONS = new Set([
  "setup-" + "webpresso",
  "setup-" + "monorepo",
  "setup-wp",
]);
const DIGEST_PATTERN = /@sha256:[a-f0-9]{64}$/i;
const PACKAGE_MANAGER_BINS = new Set([
  "pnpm",
  "pnpx",
  "npm",
  "npx",
  "yarn",
  "yarnpkg",
  "bun",
  "bunx",
]);
const EXEC_SUBCOMMANDS = new Set(["exec", "dlx", "x"]);
const OPTION_VALUE_FLAGS = new Set([
  "--cache",
  "--config",
  "--cwd",
  "--dir",
  "--filter",
  "--package",
  "--workspace",
  "-C",
  "-F",
  "-p",
  "-w",
]);

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly ref: string;
  readonly reason: string;
}

function stripInlineComment(value: string): string {
  return value.replace(/\s+#.*$/u, "").trim();
}

function shellTokens(value: string): string[] {
  return value.match(/"[^"]*"|'[^']*'|[^\s]+/gu) ?? [];
}

function normalizeToken(token: string): string {
  return token.replace(/^[;&|({`$]+|[;&|)}`]+$/gu, "").replace(/^['"]|['"]$/gu, "");
}

function normalizePackageManager(token: string): string {
  const normalized = normalizeToken(token);
  if (normalized === "corepack") return normalized;
  return normalized.replace(/@[^@\s]+$/u, "");
}

function isOption(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

function nextNonOptionToken(tokens: readonly string[], start: number): number {
  let index = start;
  while (index < tokens.length) {
    const token = normalizeToken(tokens[index] ?? "");
    if (!token) {
      index += 1;
      continue;
    }
    if (token === "--") {
      index += 1;
      continue;
    }
    if (isOption(token)) {
      const optionName = token.split("=", 1)[0] ?? token;
      index += 1;
      if (!token.includes("=") && OPTION_VALUE_FLAGS.has(optionName) && index < tokens.length) {
        index += 1;
      }
      continue;
    }
    return index;
  }
  return -1;
}

// oxlint-disable-next-line complexity -- bounded shell-token parser keeps wrapper detection local
function containsWrappedVpInvocation(value: string): boolean {
  const tokens = shellTokens(value);
  for (let index = 0; index < tokens.length; index += 1) {
    const manager = normalizePackageManager(tokens[index] ?? "");
    if (!PACKAGE_MANAGER_BINS.has(manager)) continue;

    if (manager === "npx" || manager === "pnpx" || manager === "bunx") {
      const commandIndex = nextNonOptionToken(tokens, index + 1);
      if (normalizeToken(tokens[commandIndex] ?? "") === "vp") return true;
      continue;
    }

    const subcommandIndex = nextNonOptionToken(tokens, index + 1);
    const subcommand = normalizeToken(tokens[subcommandIndex] ?? "");
    const allowedSubcommands =
      manager === "bun"
        ? new Set(["x"])
        : manager === "npm"
          ? new Set(["exec", "x"])
          : EXEC_SUBCOMMANDS;
    if (!allowedSubcommands.has(subcommand)) continue;

    const commandIndex = nextNonOptionToken(tokens, subcommandIndex + 1);
    if (normalizeToken(tokens[commandIndex] ?? "") === "vp") return true;
  }
  return false;
}

function normalizeUsesValue(raw: string): string {
  const value = stripInlineComment(raw);
  return value.replace(/^['"]|['"]$/gu, "");
}

function validateUsesRef(ref: string): string | null {
  if (ref.startsWith("./")) return null;
  if (ref.startsWith("docker://")) {
    return DIGEST_PATTERN.test(ref) ? null : "Docker actions must be pinned by sha256 digest.";
  }

  const atIndex = ref.lastIndexOf("@");
  if (atIndex === -1) return "GitHub actions must include an immutable full commit SHA.";

  const version = ref.slice(atIndex + 1);
  if (!FULL_SHA_PATTERN.test(version)) {
    return "GitHub actions must be pinned to a 40-character commit SHA.";
  }
  return null;
}

function isRetiredLocalSetupAction(ref: string): boolean {
  if (!ref.startsWith("./.github/actions/")) return false;
  const actionName = ref.slice("./.github/actions/".length).split("/", 1)[0] ?? "";
  return RETIRED_LOCAL_SETUP_ACTIONS.has(actionName);
}

// oxlint-disable-next-line complexity -- one bounded pass preserves exact workflow line diagnostics
function scanWorkflow(file: string, root: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const violations: Violation[] = [];
  const lines = text.split("\n");
  const legacyVersionInput = /setup-wp@[^\n]+\n\s+with:\n\s+version\s*:/u.exec(text);
  if (legacyVersionInput) {
    violations.push({
      file: relative(root, file),
      line: text.slice(0, legacyVersionInput.index).split("\n").length,
      ref: "setup-wp with.version",
      reason:
        "setup-wp derives its exact package version from its immutable checkout; remove the retired version input.",
    });
  }
  for (const [index, line] of lines.entries()) {
    const match = /^\s*(?:-\s*)?uses:\s*(.+?)\s*$/u.exec(line);
    if (match?.[1]) {
      const ref = normalizeUsesValue(match[1]);
      if (isRetiredLocalSetupAction(ref)) {
        violations.push({
          file: relative(root, file),
          line: index + 1,
          ref,
          reason:
            "Use the externally owned immutable setup-wp action, not a repo-local setup action.",
        });
      }
      const reason = validateUsesRef(ref);
      if (reason) {
        violations.push({
          file: relative(root, file),
          line: index + 1,
          ref,
          reason,
        });
      }
    }

    if (
      line.includes("@webpresso/agent-kit") &&
      /\b(?:npm\s+(?:install|i)|pnpm\s+(?:add|install)|bun\s+(?:add|install)|vp\s+install)\b.*(?:-g|--global)/u.test(
        line,
      )
    ) {
      violations.push({
        file: relative(root, file),
        line: index + 1,
        ref: line.trim(),
        reason:
          "Do not install @webpresso/agent-kit directly; use the immutable external setup-wp action.",
      });
    }
    if (/^\s*(?:AGENT_KIT_VERSION|WP_SETUP_AGENT_KIT_VERSION)(?::|=)/u.test(line)) {
      violations.push({
        file: relative(root, file),
        line: index + 1,
        ref: line.trim(),
        reason: "Remove legacy agent-kit version pins; setup-wp is self-versioning.",
      });
    }

    const commandLine = stripInlineComment(line);
    if (containsWrappedVpInvocation(commandLine)) {
      violations.push({
        file: relative(root, file),
        line: index + 1,
        ref: commandLine.trim(),
        reason:
          "Do not invoke vp through a package-manager wrapper. Use the global `vp` binary directly; set it up in CI with SHA-pinned voidzero-dev/setup-vp first.",
      });
    }
  }
  return violations;
}

function workflowFiles(root: string): string[] {
  const workflowsDir = join(root, ".github", "workflows");
  if (!existsSync(workflowsDir)) return [];

  return readdirSync(workflowsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name))
    .map((entry) => join(workflowsDir, entry.name))
    .sort();
}

const root = resolve(process.argv[2] ?? process.cwd());
const violations = workflowFiles(root).flatMap((file) => scanWorkflow(file, root));

if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(
      `${violation.file}:${violation.line}: ${violation.reason} Found ${violation.ref}\n`,
    );
  }
  process.exit(1);
}

process.stdout.write("OK: GitHub workflow actions are pinned to immutable refs\n");
