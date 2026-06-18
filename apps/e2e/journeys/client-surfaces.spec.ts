import { test, expect, type Page } from "@playwright/test";
import {
  PLAYWRIGHT_ACTION_TIMEOUT_MS,
  createQueue,
  createRunId,
  createTopic,
  signUpAndAttachSession,
  subscribeTopic,
} from "./playwright-seed";

type SeededClientSurface = {
  queueId: string;
  queueName: string;
  topicId: string;
  topicName: string;
};

async function seedClientSurface(page: Page): Promise<SeededClientSurface> {
  const runId = createRunId();
  const session = await signUpAndAttachSession(page, {
    email: `client-ui-${runId}@playwright.test`,
    password: `Pass-${runId}-Abc123!`,
    name: `Client UI ${runId}`,
  });

  try {
    const queueName = `client-ui-queue-${runId}`;
    const queueId = await createQueue(session.request, { name: queueName, retentionPeriod: 7 });

    const topicName = `client-ui-topic-${runId}`;
    const topicId = await createTopic(session.request, { name: topicName });

    await subscribeTopic(session.request, topicId, queueId);

    return { queueId, queueName, topicId, topicName };
  } finally {
    await session.dispose();
  }
}

test.describe("client shipped surfaces", () => {
  test.describe.configure({ timeout: PLAYWRIGHT_ACTION_TIMEOUT_MS });

  test("authenticated operators can navigate the shipped client surfaces", async ({ page }) => {
    const seeded = await seedClientSurface(page);

    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: /IngestLens operations dashboard/i }),
    ).toBeVisible();
    await expect(page.getByText(seeded.queueName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(seeded.topicName)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("link", { name: /^Queues$/i }).click();
    await expect(page.getByRole("heading", { name: /Delivery Queues/i })).toBeVisible();
    await expect(page.getByText(seeded.queueName)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("link", { name: /^Topics$/i }).click();
    await expect(page.getByRole("heading", { name: /Delivery Topics/i })).toBeVisible();
    await expect(page.getByText(seeded.topicName)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("link", { name: /Server Metrics/i }).click();
    await expect(page.getByRole("heading", { name: /Delivery and intake metrics/i })).toBeVisible();
    await expect(
      page.getByText(/No metrics available|System Activity|System Info/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /AI Intake/i }).click();
    await expect(page.getByRole("heading", { name: /Intake mapping/i })).toBeVisible();
    await expect(page.getByText(/Create intake suggestion/i)).toBeVisible();

    await page.getByRole("link", { name: /Admin Intake Review/i }).click();
    await expect(page.getByRole("heading", { name: /Intake admin review/i })).toBeVisible();
    await expect(page.getByText(/No pending review attempts/i)).toBeVisible({ timeout: 15_000 });
  });

  test("queue and topic detail surfaces deep-link cleanly", async ({ page }) => {
    const seeded = await seedClientSurface(page);

    await page.goto(`/queues/${seeded.queueId}`);
    await expect(page.getByText(/Queue Details/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("h1")).toHaveText(seeded.queueName, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /^Send Message$/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto(`/topics/${seeded.topicId}`);
    await expect(page.getByText(/Topic Details/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("h1")).toHaveText(seeded.topicName, { timeout: 10_000 });
    await expect(page.getByText(seeded.queueName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /View Queue/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
