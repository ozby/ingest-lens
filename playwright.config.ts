import { createQualityScaffoldConfig } from "@webpresso/app-config/playwright/quality-scaffold";

// Keep the repo-specific client-shell spec while reusing the shared Playwright defaults.
export default createQualityScaffoldConfig({
  testDir: "./e2e",
});
