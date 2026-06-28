import { test, expect, type Page } from "@playwright/test";

const apiBaseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8787";

type SeededClientSurface = {
  queueId: string;
  queueName: string;
  topicId: string;
  topicName: string;
};

async function authenticateOperator(page: Page) {
  const runId = Math.random().toString(36).slice(2, 8);
  await signUp(page, runId);
}

async function waitForTopicSubscription(page: Page, topicId: string, queueId: string) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ({ apiBaseUrl, topicId }) => {
            const response = await fetch(`${apiBaseUrl}/api/topics/${topicId}`, {
              credentials: "include",
            });
            const body = await response.json();
            return {
              status: response.status,
              subscribedQueues: (body as { data?: { topic?: { subscribedQueues?: string[] } } })
                .data?.topic?.subscribedQueues,
            };
          },
          { apiBaseUrl, topicId },
        ),
      { timeout: 10_000 },
    )
    .toMatchObject({
      status: 200,
      subscribedQueues: expect.arrayContaining([queueId]),
    });
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
  await waitForTopicSubscription(page, topicId, queueId);

  return { queueId, queueName, topicId, topicName };
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
