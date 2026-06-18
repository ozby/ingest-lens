import { test, expect, type Page } from "@playwright/test";
import {
  PLAYWRIGHT_ACTION_TIMEOUT_MS,
  createQueue,
  createRunId,
  signUpAndAttachSession,
} from "./playwright-seed";

async function bootstrap(page: Page): Promise<{
  queueId: string;
  session: Awaited<ReturnType<typeof signUpAndAttachSession>>;
  runId: string;
}> {
  const runId = createRunId();
  const session = await signUpAndAttachSession(page, {
    email: `pw-${runId}@playwright.test`,
    password: `Pass-${runId}-Abc123!`,
    name: `Playwright ${runId}`,
  });
  try {
    const queueId = await createQueue(session.request, {
      name: `pw-q-${runId}`,
      retentionPeriod: 7,
    });
    return { queueId, session, runId };
  } catch (error) {
    await session.dispose();
    throw error;
  }
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
  test.describe.configure({ timeout: PLAYWRIGHT_ACTION_TIMEOUT_MS });

  test("intake form renders and submits a new attempt", async ({ page }) => {
    const { queueId, session, runId } = await bootstrap(page);
    try {
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
    } finally {
      await session.dispose();
    }
  });

  test("admin review page renders with attempt list", async ({ page }) => {
    const { queueId, session, runId } = await bootstrap(page);
    try {
      const sourceSystem = `pw-admin-src-${runId}`;

      const intakeResponse = await session.request.post("/api/intake/mapping-suggestions", {
        data: {
          sourceSystem,
          contractId: "job-posting-v1",
          payload: jobPostingPayload,
          queueId,
        },
      });
      expect([200, 201]).toContain(intakeResponse.status());
      const intakeRes = {
        status: intakeResponse.status(),
        body: (await intakeResponse.json()) as unknown,
      };

      await page.goto("/admin/intake");
      await expect(page.getByRole("heading", { name: /Intake admin review/i })).toBeVisible();
      if (intakeRes.status === 201) {
        await expect(page.getByText(/Contract: job-posting-v1/i).first()).toBeVisible({
          timeout: 10_000,
        });
        await expect(page.getByText(/Sanitized payload preview/i).first()).toBeVisible();
        await expect(page.getByRole("button", { name: /Approve selected/i }).first()).toBeVisible();
        return;
      }

      await expect(page.getByText(/No pending review attempts/i)).toBeVisible({ timeout: 10_000 });
    } finally {
      await session.dispose();
    }
  });

  test("approve flow changes attempt status from pending_review", async ({ page }) => {
    const { queueId, session, runId } = await bootstrap(page);
    try {
      const sourceSystem = `pw-approve-src-${runId}`;

      const intakeResponse = await session.request.post("/api/intake/mapping-suggestions", {
        data: {
          sourceSystem,
          contractId: "job-posting-v1",
          payload: jobPostingPayload,
          queueId,
        },
      });

      expect(intakeResponse.status()).toBe(201);
      const intakeRes = {
        status: intakeResponse.status(),
        body: (await intakeResponse.json()) as unknown,
      };
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
    } finally {
      await session.dispose();
    }
  });
});
