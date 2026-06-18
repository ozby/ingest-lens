import { request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";

export const apiBaseUrl = process.env.E2E_BASE_URL ?? "http://localhost:8787";
export const clientBaseUrl = process.env.E2E_CLIENT_URL ?? "http://localhost:3000";
export const PLAYWRIGHT_ACTION_TIMEOUT_MS = 60_000;
export const PLAYWRIGHT_API_TIMEOUT_MS = 15_000;

type StorageCookie = Awaited<ReturnType<APIRequestContext["storageState"]>>["cookies"][number];

type BrowserCookie = Parameters<ReturnType<Page["context"]>["addCookies"]>[0][number];

export type AuthenticatedSeedSession = {
  request: APIRequestContext;
  dispose(): Promise<void>;
};

export function createRunId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function buildBrowserCookiesFromStorage(
  cookies: StorageCookie[],
  targetUrl: string = clientBaseUrl,
): BrowserCookie[] {
  const target = new URL(targetUrl);
  return cookies.flatMap((cookie) => {
    const baseCookie = cookie as BrowserCookie;
    if (cookie.domain === target.hostname) {
      return [baseCookie];
    }

    const { domain: _domain, path: _path, ...cookieWithoutDomain } = cookie;
    return [
      baseCookie,
      {
        ...cookieWithoutDomain,
        url: target.origin,
      } satisfies BrowserCookie,
    ];
  });
}

export async function signUpAndAttachSession(
  page: Page,
  input: {
    email: string;
    password: string;
    name: string;
  },
): Promise<AuthenticatedSeedSession> {
  // Keep API seeding independent from the browser context. In act/GitHub CI the
  // client worker proxy can leave APIRequestContext.post('/auth/...') pending
  // until Playwright times out and closes the page context. Signing up directly
  // against the API worker, then importing the resulting cookies into the page,
  // preserves the shipped UI session without coupling seeding to page lifetime.
  // The helper intentionally does not navigate: callers seed all data first,
  // then navigate to the surface under test without hidden background API load.
  const authenticatedRequest = await playwrightRequest.newContext({
    baseURL: apiBaseUrl,
  });

  try {
    const signUp = await authenticatedRequest.post("/auth/sign-up/email", {
      data: input,
      timeout: PLAYWRIGHT_API_TIMEOUT_MS,
    });
    if (signUp.status() !== 200) {
      throw new Error(`Sign-up failed with status ${signUp.status()}`);
    }

    const session = await authenticatedRequest.get("/auth/get-session", {
      timeout: PLAYWRIGHT_API_TIMEOUT_MS,
    });
    if (session.status() !== 200) {
      throw new Error(`Session bootstrap failed with status ${session.status()}`);
    }

    const storageState = await authenticatedRequest.storageState();
    await page.context().addCookies(buildBrowserCookiesFromStorage(storageState.cookies));

    return {
      request: authenticatedRequest,
      dispose: () => authenticatedRequest.dispose(),
    };
  } catch (error) {
    await authenticatedRequest.dispose().catch(() => {});
    throw error;
  }
}

export async function createQueue(
  request: APIRequestContext,
  input: {
    name: string;
    retentionPeriod?: number;
  },
): Promise<string> {
  const response = await request.post("/api/queues", {
    data: {
      name: input.name,
      retentionPeriod: input.retentionPeriod ?? 7,
    },
    timeout: PLAYWRIGHT_API_TIMEOUT_MS,
  });
  if (response.status() !== 201) {
    throw new Error(`Queue creation failed with status ${response.status()}`);
  }
  const body = (await response.json()) as { data: { queue: { id: string } } };
  return body.data.queue.id;
}

export async function createTopic(
  request: APIRequestContext,
  input: { name: string },
): Promise<string> {
  const response = await request.post("/api/topics", {
    data: input,
    timeout: PLAYWRIGHT_API_TIMEOUT_MS,
  });
  if (response.status() !== 201) {
    throw new Error(`Topic creation failed with status ${response.status()}`);
  }
  const body = (await response.json()) as { data: { topic: { id: string } } };
  return body.data.topic.id;
}

export async function subscribeTopic(
  request: APIRequestContext,
  topicId: string,
  queueId: string,
): Promise<void> {
  const response = await request.post(`/api/topics/${topicId}/subscribe`, {
    data: { queueId },
    timeout: PLAYWRIGHT_API_TIMEOUT_MS,
  });
  if (response.status() !== 200) {
    throw new Error(`Topic subscribe failed with status ${response.status()}`);
  }
}
