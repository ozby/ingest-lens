import { test, expect } from "@playwright/test";

const clientBaseUrl = process.env.E2E_CLIENT_URL ?? "https://dev.ingest-lens.ozby.dev";
const apiBaseUrl = process.env.E2E_API_URL ?? "https://api.dev.ingest-lens.ozby.dev";

type JsonResponse<T> = {
  status: number;
  body: T;
};

test.describe("webpresso auth bench (dev deploy)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sign-up -> sign-in -> org membership -> CRUD -> sign-out works on the deployed dev surfaces", async ({
    page,
    context,
  }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    const email = `codex-${runId}@example.test`;
    const password = `Pw-${runId}-Abc123!`;
    const name = `Codex ${runId}`;
    const queueName = `codex-q-${runId}`;
    const organizationName = `Codex Org ${runId}`;
    const organizationSlug = `codex-org-${runId}`;

    await page.goto(clientBaseUrl);
    await expect(
      page.getByText(
        "Sign in to inspect delivery rails, monitor observability, and prepare for future intake mapping workflows.",
      ),
    ).toBeVisible();

    const signUp = await page.evaluate(
      async (credentials) => {
        const response = await fetch("/auth/sign-up/email", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(credentials),
        });
        return {
          status: response.status,
          body: await response.json(),
        };
      },
      { email, password, name },
    );
    expect(signUp.status).toBe(200);
    expect(signUp.body.user.email).toBe(email);

    await page.goto(`${clientBaseUrl}/dashboard`);

    await expect(
      page.getByText(
        "Track delivery rails, queue activity, and observability across your owned queues and topics.",
      ),
    ).toBeVisible({ timeout: 30_000 });

    const sessionCookies = await context.cookies([clientBaseUrl, apiBaseUrl]);
    expect(
      sessionCookies.some((cookie) => cookie.domain === ".ingest-lens.ozby.dev"),
      `expected a cross-subdomain auth cookie, got: ${JSON.stringify(sessionCookies, null, 2)}`,
    ).toBe(true);

    const signOutFromDashboard = async () => {
      const signOut = await page.evaluate(async () => {
        const response = await fetch("/auth/sign-out", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        return {
          status: response.status,
          body: await response.json(),
        };
      });
      expect(signOut.status).toBe(200);
      expect(signOut.body.success).toBe(true);

      await page.goto(`${clientBaseUrl}/dashboard`);
      await expect(
        page.getByText(
          "Sign in to inspect delivery rails, monitor observability, and prepare for future intake mapping workflows.",
        ),
      ).toBeVisible({ timeout: 30_000 });
    };

    await signOutFromDashboard();

    const signIn = await page.evaluate(
      async (credentials) => {
        const response = await fetch("/auth/sign-in/email", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(credentials),
        });
        return {
          status: response.status,
          body: await response.json(),
        };
      },
      { email, password },
    );
    expect(signIn.status).toBe(200);
    expect(signIn.body.user.email).toBe(email);

    await page.goto(`${clientBaseUrl}/dashboard`);

    await expect(
      page.getByText(
        "Track delivery rails, queue activity, and observability across your owned queues and topics.",
      ),
    ).toBeVisible({ timeout: 30_000 });

    const session = await page.evaluate(async (): Promise<JsonResponse<any>> => {
      const response = await fetch("/auth/get-session", {
        credentials: "include",
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    });
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(email);

    const organization = await page.evaluate(
      async ({
        name,
        slug,
      }: {
        name: string;
        slug: string;
      }): Promise<{
        createStatus: number | null;
        createBody: unknown;
        listStatus: number;
        listBody: unknown;
      }> => {
        let createStatus: number | null = null;
        let createBody: unknown = null;

        let listResponse = await fetch("/auth/organization/list", {
          credentials: "include",
        });
        let listBody = await listResponse.json();

        if (!Array.isArray(listBody) || listBody.length === 0) {
          const createResponse = await fetch("/auth/organization/create", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, slug }),
          });
          createStatus = createResponse.status;
          createBody = await createResponse.json();

          listResponse = await fetch("/auth/organization/list", {
            credentials: "include",
          });
          listBody = await listResponse.json();
        }

        return {
          createStatus,
          createBody,
          listStatus: listResponse.status,
          listBody,
        };
      },
      { name: organizationName, slug: organizationSlug },
    );
    expect(organization.listStatus).toBe(200);
    expect(Array.isArray(organization.listBody)).toBe(true);
    expect((organization.listBody as Array<unknown>).length).toBeGreaterThan(0);

    const queue = await page.evaluate(
      async ({
        apiBaseUrl,
        queueName,
      }: {
        apiBaseUrl: string;
        queueName: string;
      }): Promise<{
        createStatus: number;
        createBody: unknown;
        listStatus: number;
        listBody: unknown;
        deleteStatus: number | null;
      }> => {
        const createResponse = await fetch(`${apiBaseUrl}/api/queues`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: queueName }),
        });
        const createBody = await createResponse.json();

        const listResponse = await fetch(`${apiBaseUrl}/api/queues`, {
          credentials: "include",
        });
        const listBody = await listResponse.json();

        let deleteStatus: number | null = null;
        const queueId =
          typeof createBody === "object" && createBody !== null
            ? (createBody as any)?.data?.queue?.id
            : null;

        if (typeof queueId === "string") {
          const deleteResponse = await fetch(`${apiBaseUrl}/api/queues/${queueId}`, {
            method: "DELETE",
            credentials: "include",
          });
          deleteStatus = deleteResponse.status;
        }

        return {
          createStatus: createResponse.status,
          createBody,
          listStatus: listResponse.status,
          listBody,
          deleteStatus,
        };
      },
      { apiBaseUrl, queueName },
    );
    expect(queue.createStatus).toBe(201);
    expect(queue.listStatus).toBe(200);
    expect(queue.deleteStatus).toBe(200);

    await signOutFromDashboard();

    const postSignOutSession = await page.evaluate(async (): Promise<JsonResponse<any>> => {
      const response = await fetch("/auth/get-session", {
        credentials: "include",
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    });
    expect(postSignOutSession.status).toBe(200);
    expect(postSignOutSession.body).toBeNull();

    await page.goto(`${clientBaseUrl}/dashboard`);
    await expect(
      page.getByText(
        "Sign in to inspect delivery rails, monitor observability, and prepare for future intake mapping workflows.",
      ),
    ).toBeVisible({ timeout: 30_000 });
  });
});
