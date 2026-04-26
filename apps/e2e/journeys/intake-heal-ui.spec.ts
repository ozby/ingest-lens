import { test, expect, type APIRequestContext } from "@playwright/test";

const apiBaseUrl = process.env.E2E_BASE_URL ?? "http://localhost:8787";

async function registerAndGetToken(
  request: APIRequestContext,
): Promise<{ token: string; queueId: string }> {
  const runId = Math.random().toString(36).slice(2, 8);
  const regRes = await request.post(`${apiBaseUrl}/api/auth/register`, {
    data: {
      username: `pw-${runId}`,
      email: `pw-${runId}@playwright.test`,
      password: `Pass-${runId}`,
    },
  });
  const reg = (await regRes.json()) as { data: { token: string } };
  const token = reg.data.token;

  const queueRes = await request.post(`${apiBaseUrl}/api/queues`, {
    data: { name: `pw-q-${runId}`, retentionPeriod: 7 },
    headers: { Authorization: `Bearer ${token}` },
  });
  const queue = (await queueRes.json()) as { data: { queue: { id: string } } };
  const queueId = queue.data.queue.id;

  return { token, queueId };
}

test.describe("intake heal UI", () => {
  let token: string;
  let queueId: string;

  test.beforeAll(async ({ request }) => {
    ({ token, queueId } = await registerAndGetToken(request));
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ t }: { t: string }) => {
        localStorage.setItem("authToken", t);
      },
      { t: token },
    );
  });

  test("intake form renders and submits a new attempt", async ({ page }) => {
    await page.goto("/intake");

    // Form is visible
    await expect(page.getByPlaceholder("Source system")).toBeVisible();

    // Fill in the form fields
    await page.getByPlaceholder("Source system").fill("playwright-src");
    await page.getByPlaceholder("Contract ID").fill("employee-v1");

    // Payload textarea
    const payloadField = page.getByPlaceholder(/customerId|json|payload/i).first();
    await payloadField.fill('{"employeeName":"Playwright","employeeEmail":"pw@test.com"}');

    // Queue ID field
    const queueField = page.getByPlaceholder(/Queue ID/i);
    await queueField.fill(queueId);

    // Submit
    await page.getByRole("button", { name: /submit|send|create|suggest/i }).click();

    // A new row appears in the attempt list
    await expect(page.getByText("playwright-src")).toBeVisible({ timeout: 10_000 });
  });

  test("admin review page renders with attempt list", async ({ page }) => {
    await page.goto("/admin/intake");

    // Page heading visible
    await expect(page.getByRole("heading")).toBeVisible();

    // At least one status badge or row visible (the attempt created in the previous test)
    // Accept any status badge text
    const badges = page.locator("[class*='badge'], [class*='status'], [class*='Badge']");
    await expect(badges.first()).toBeVisible({ timeout: 10_000 });
  });

  test("approve flow changes attempt status from pending_review", async ({ page, request }) => {
    // Create a fresh attempt via API to ensure we have a pending one
    const intakeRes = await request.post(`${apiBaseUrl}/api/intake/mapping-suggestions`, {
      data: {
        sourceSystem: "pw-approve-src",
        contractId: "employee-v1",
        payload: { employeeName: "ApproveTest", employeeEmail: "approve@test.com" },
        queueId,
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    const intakeBody = (await intakeRes.json()) as {
      data: { attempt: { intakeAttemptId: string; status: string } };
    };

    // If the attempt is already approved (auto-heal), skip the UI approve step
    if (intakeBody.data.attempt.status !== "pending_review") {
      // Auto-healed — already approved, just verify the API succeeded
      expect(["approved", "ingested"].includes(intakeBody.data.attempt.status)).toBe(true);
      return;
    }

    await page.goto("/admin/intake");

    // Find a row with pending_review status and click approve
    const pendingRow = page.locator("text=pending_review").first();
    await expect(pendingRow).toBeVisible({ timeout: 10_000 });

    // Look for an approve button near the pending row
    const approveBtn = page.getByRole("button", { name: /approve/i }).first();
    await expect(approveBtn).toBeVisible({ timeout: 5_000 });
    await approveBtn.click();

    // Status should change away from pending_review
    await expect(page.getByText("pending_review")).not.toBeVisible({ timeout: 10_000 });
  });
});
