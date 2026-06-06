import { config } from "@webpresso/agent-kit/oxlint";

const oxlintConfig: Record<string, unknown> = {
  ...config,
  env: {
    builtin: true,
    node: true,
  },
  ignorePatterns: [
    "dist",
    "node_modules",
    "reports",
    ".stryker-tmp",
    ".agent",
    ".agents",
    ".claude",
    ".codex",
    ".cursor",
    ".gemini",
    ".opencode",
    ".omx",
    ".windsurf",
  ],
};

export default oxlintConfig;
