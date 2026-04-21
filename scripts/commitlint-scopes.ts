export const SCOPES = [
  // workspaces
  "api-server",
  "notification-server",
  "client",
  "workers",
  // packages
  "db",
  "logger",
  "test-utils",
  "types",
  "ui",
  "config-eslint",
  "config-typescript",
  "jest-presets",
  // cross-cutting
  "deps",
  "dx",
  "ci",
  "infra",
  "docs",
  "adrs",
  "blueprints",
  "scripts",
  "release",
] as const;

export type Scope = (typeof SCOPES)[number];
