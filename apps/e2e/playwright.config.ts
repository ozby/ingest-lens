import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./journeys",
  testMatch: "**/*.spec.ts",
  workers: 1,
  use: {
    baseURL: process.env.E2E_CLIENT_URL ?? "http://localhost:3000",
  },
  timeout: 30_000,
});
