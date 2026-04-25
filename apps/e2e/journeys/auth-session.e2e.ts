import { describe, expect, it } from "vitest";

const baseUrl = process.env.E2E_BASE_URL;

if (!baseUrl) {
  throw new Error("E2E_BASE_URL is required for apps/e2e/journeys/auth-session.e2e.ts");
}

type AuthSuccess = {
  status: "success";
  data: {
    token?: string;
    user: {
      id: string;
      username: string;
      email: string;
      createdAt: string;
    };
  };
};

type AuthError = {
  status: "error";
  message: string;
};

async function postJson(
  path: string,
  body: Record<string, string>,
  headers?: HeadersInit,
): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function getJson(path: string, headers?: HeadersInit): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    headers,
  });
}

describe("auth session journey", () => {
  it("registers, rejects an invalid session lookup, logs in, and returns the current user", async () => {
    const runId = crypto.randomUUID().slice(0, 8);
    const credentials = {
      username: `e2e-user-${runId}`,
      email: `e2e-user-${runId}@example.test`,
      password: `Pass-${runId}`,
    };

    const unauthorizedMeResponse = await getJson("/api/auth/me");
    expect(unauthorizedMeResponse.status).toBe(401);
    const unauthorizedMeBody = (await unauthorizedMeResponse.json()) as AuthError;
    expect(unauthorizedMeBody).toMatchObject({
      status: "error",
      message: "Authentication required",
    });

    const registerResponse = await postJson("/api/auth/register", credentials);
    expect(registerResponse.status).toBe(201);
    const registerBody = (await registerResponse.json()) as AuthSuccess;

    expect(registerBody.status).toBe("success");
    expect(registerBody.data.token).toEqual(expect.any(String));
    expect(registerBody.data.user).toMatchObject({
      username: credentials.username,
      email: credentials.email,
    });

    const wrongPasswordResponse = await postJson("/api/auth/login", {
      username: credentials.username,
      password: `${credentials.password}-wrong`,
    });
    expect(wrongPasswordResponse.status).toBe(401);
    const wrongPasswordBody = (await wrongPasswordResponse.json()) as AuthError;
    expect(wrongPasswordBody).toMatchObject({
      status: "error",
      message: "Invalid credentials",
    });

    const loginResponse = await postJson("/api/auth/login", {
      username: credentials.username,
      password: credentials.password,
    });
    expect(loginResponse.status).toBe(200);
    const loginBody = (await loginResponse.json()) as AuthSuccess;

    expect(loginBody.status).toBe("success");
    expect(loginBody.data.token).toEqual(expect.any(String));
    expect(loginBody.data.user).toMatchObject({
      id: registerBody.data.user.id,
      username: credentials.username,
      email: credentials.email,
    });

    const meResponse = await getJson("/api/auth/me", {
      Authorization: `Bearer ${loginBody.data.token}`,
    });
    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as AuthSuccess;
    expect(meBody).toMatchObject({
      status: "success",
      data: {
        user: {
          id: registerBody.data.user.id,
          username: credentials.username,
          email: credentials.email,
          createdAt: registerBody.data.user.createdAt,
        },
      },
    });
  });
});
