import { test, expect, type Page } from "@playwright/test";

const apiBaseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8787";

type SeededClientSurface = {
  queueId: string;
  queueName: string;
  topicId: string;
  topicName: string;
};

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

async function seedClientSurface(page: Page): Promise<SeededClientSurface> {
  const runId = Math.random().toString(36).slice(2, 8);
  await signUp(page, runId);

  const queueName = `client-ui-queue-${runId}`;
  const queueResponse = await page.evaluate(
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
    { apiBaseUrl, queueName },
  );
  expect(queueResponse.status).toBe(201);
  const queueId = (queueResponse.body as { data: { queue: { id: string } } }).data.queue.id;

  const topicName = `client-ui-topic-${runId}`;
  const topicResponse = await page.evaluate(
    async ({ apiBaseUrl, topicName }) => {
      const response = await fetch(`${apiBaseUrl}/api/topics`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: topicName }),
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    },
    { apiBaseUrl, topicName },
  );
  expect(topicResponse.status).toBe(201);
  const topicId = (topicResponse.body as { data: { topic: { id: string } } }).data.topic.id;

  const subscribeResponse = await page.evaluate(
    async ({ apiBaseUrl, topicId, queueId }) => {
      const response = await fetch(`${apiBaseUrl}/api/topics/${topicId}/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queueId }),
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    },
    { apiBaseUrl, topicId, queueId },
  );
  expect(subscribeResponse.status).toBe(200);

  return { queueId, queueName, topicId, topicName };
}

test.describe("client shipped surfaces", () => {
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
    ).toBeVisible();

    await page.getByRole("link", { name: /AI Intake/i }).click();
    await expect(page.getByRole("heading", { name: /Intake mapping/i })).toBeVisible();
    await expect(page.getByText(/Create intake suggestion/i)).toBeVisible();

    await page.getByRole("link", { name: /Admin Intake Review/i }).click();
    await expect(page.getByRole("heading", { name: /Intake admin review/i })).toBeVisible();
    await expect(page.getByText(/No pending review attempts/i)).toBeVisible();
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
