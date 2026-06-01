import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const smokePagePath = join(process.cwd(), "e2e", "fixtures", "smoke.html");

test("checks the file-based smoke page", async () => {
  const html = await readFile(smokePagePath, "utf8");

  expect(html).toContain("Agent Kit quality scaffold");
  expect(html).toContain('data-testid="status"');
  expect(html).toContain("ready");
});
