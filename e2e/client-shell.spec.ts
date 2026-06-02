import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = process.cwd();
const clientShellPath = join(repoRoot, "apps", "client", "index.html");

test("checks the committed client HTML shell", async ({ page }) => {
  const html = await readFile(clientShellPath, "utf8");
  await page.setContent(html);

  await expect(page).toHaveTitle("Ozby's pubsub metrics dashboard");
  await expect(page.locator("#root")).toHaveCount(1);
  expect(html).toContain('script type="module" src="/src/main.tsx"');
});
