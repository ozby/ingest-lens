import { test, expect, type Page } from "@playwright/test";

async function authenticateOperator(page: Page) {
  const runId = Math.random().toString(36).slice(2, 8);
  await signUp(page, runId);
}

async function signUp(page: Page, runId: string) {
  await page.goto("/");

  const signUp = await page.evaluate(
    async ({ email, password, name }) => {
      const response = await fetch("/auth/sign-up/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    },
    {
      email: `client-ui-${runId}@playwright.test`,
      password: `Pass-${runId}-Abc123!`,
      name: `Client UI ${runId}`,
    },
  );

  expect(signUp.status).toBe(200);

  const session = await page.evaluate(async () => {
    const response = await fetch("/auth/get-session", {
      credentials: "include",
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(session.status).toBe(200);
}

async function waitForAuthenticatedDashboard(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText(
      "Track delivery rails, queue activity, and observability across your owned queues and topics.",
    ),
  ).toBeVisible({ timeout: 10_000 });
}

test.describe("client shipped surfaces", () => {
  test("authenticated operators can navigate the shipped client surfaces", async ({ page }) => {
    await authenticateOperator(page);

    await waitForAuthenticatedDashboard(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/queues");
    await expect(page).toHaveURL(/\/queues$/);
    await expect(page.getByRole("link", { name: /^Queues$/i })).toBeVisible({ timeout: 10_000 });

    await page.goto("/topics");
    await expect(page).toHaveURL(/\/topics$/);
    await expect(page.getByRole("link", { name: /^Topics$/i })).toBeVisible({ timeout: 10_000 });

    await page.goto("/metrics");
    await expect(page).toHaveURL(/\/metrics$/);
    await expect(page.getByRole("link", { name: /Server Metrics/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/intake");
    await expect(page).toHaveURL(/\/intake$/);
    await expect(page.getByRole("link", { name: /AI Intake/i })).toBeVisible({ timeout: 10_000 });

    await page.goto("/admin/intake");
    await expect(page).toHaveURL(/\/admin\/intake$/);
    await expect(page.getByRole("link", { name: /Admin Intake Review/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
