import { test, expect, type Page } from "@playwright/test";

const apiBaseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8787";

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
      email: `pw-${runId}@playwright.test`,
      password: `Pass-${runId}-Abc123!`,
      name: `Playwright ${runId}`,
    },
  );

  expect(signUp.status).toBe(200);
}

async function createQueue(page: Page, runId: string): Promise<string> {
  const queueRes = await page.evaluate(
    async ({ apiBaseUrl, queueName }) => {
      const response = await fetch(`${apiBaseUrl}/api/queues`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: queueName, retentionPeriod: 7 }),
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    },
    { apiBaseUrl, queueName: `pw-q-${runId}` },
  );

  expect(queueRes.status).toBe(201);
  return (queueRes.body as { data: { queue: { id: string } } }).data.queue.id;
}

async function bootstrap(page: Page): Promise<{ queueId: string; runId: string }> {
  const runId = Math.random().toString(36).slice(2, 8);
  await signUp(page, runId);
  const queueId = await createQueue(page, runId);
  return { queueId, runId };
}

const jobPostingPayload = {
  title: "Playwright Staff Engineer",
  status: "published",
  department: "Engineering",
  location: "Remote",
  apply_url: "https://jobs.example.com/playwright-staff-engineer",
  employment_type: "full_time",
};

test.describe("intake heal UI", () => {
  test("intake form renders and submits a new attempt", async ({ page }) => {
    const { queueId, runId } = await bootstrap(page);
    const sourceSystem = `playwright-src-${runId}`;

    await page.goto("/intake");

    await expect(page.getByPlaceholder("Source system")).toBeVisible();
    await page.getByPlaceholder("Source system").fill(sourceSystem);
    await page.getByPlaceholder("Contract ID").fill("job-posting-v1");

    const payloadField = page.getByPlaceholder(/customerId|json|payload/i).first();
    await payloadField.fill(JSON.stringify(jobPostingPayload));

    const queueField = page.getByPlaceholder(/Queue ID/i);
    await queueField.fill(queueId);

    const createSuggestionResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/intake/mapping-suggestions") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /submit|send|create|suggest/i }).click();
    expect((await createSuggestionResponse).ok()).toBe(true);
    await page.getByRole("tab", { name: /Review history/i }).click();
    await expect(page.getByText(`Source: ${sourceSystem}`)).toBeVisible({ timeout: 10_000 });
  });

  test("admin review page renders with attempt list", async ({ page }) => {
    const { queueId, runId } = await bootstrap(page);
    const sourceSystem = `pw-admin-src-${runId}`;

    const intakeRes = await page.evaluate(
      async ({ apiBaseUrl, queueId, payload, sourceSystem }) => {
        const response = await fetch(`${apiBaseUrl}/api/intake/mapping-suggestions`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceSystem,
            contractId: "job-posting-v1",
            payload,
            queueId,
          }),
        });
        return {
          status: response.status,
          body: await (async () => {
            const text = await response.text();
            try {
              return JSON.parse(text);
            } catch {
              return text;
            }
          })(),
        };
      },
      { apiBaseUrl, queueId, payload: jobPostingPayload, sourceSystem },
    );
    expect(intakeRes.status).toBe(201);

    await page.goto("/admin/intake");
    await expect(page.getByRole("heading", { name: /Intake admin review/i })).toBeVisible();
    await expect(page.getByText(/Contract: job-posting-v1/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Sanitized payload preview/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve selected/i }).first()).toBeVisible();
  });

  test("approve flow changes attempt status from pending_review", async ({ page }) => {
    const { queueId, runId } = await bootstrap(page);
    const sourceSystem = `pw-approve-src-${runId}`;

    const intakeRes = await page.evaluate(
      async ({ apiBaseUrl, queueId, payload, sourceSystem }) => {
        const response = await fetch(`${apiBaseUrl}/api/intake/mapping-suggestions`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceSystem,
            contractId: "job-posting-v1",
            payload,
            queueId,
          }),
        });
        return {
          status: response.status,
          body: await (async () => {
            const text = await response.text();
            try {
              return JSON.parse(text);
            } catch {
              return text;
            }
          })(),
        };
      },
      { apiBaseUrl, queueId, payload: jobPostingPayload, sourceSystem },
    );

    expect(intakeRes.status).toBe(201);
    const intakeBody = intakeRes.body as {
      data: { attempt: { intakeAttemptId: string; status: string } };
    };

    if (intakeBody.data.attempt.status !== "pending_review") {
      expect(["approved", "ingested", "abstained"].includes(intakeBody.data.attempt.status)).toBe(
        true,
      );
      return;
    }

    await page.goto("/admin/intake");

    const pendingRow = page.locator("text=pending_review").first();
    await expect(pendingRow).toBeVisible({ timeout: 10_000 });

    const firstSuggestionCheckbox = page.getByRole("checkbox").first();
    await expect(firstSuggestionCheckbox).toBeVisible({ timeout: 5_000 });
    await firstSuggestionCheckbox.check();

    const approveBtn = page.getByRole("button", { name: /approve/i }).first();
    await expect(approveBtn).toBeEnabled({ timeout: 5_000 });
    await approveBtn.click();

    await expect(page.getByText("pending_review")).not.toBeVisible({ timeout: 10_000 });
  });
});
