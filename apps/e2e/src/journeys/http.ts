export type JsonResult<T> = { response: Response; body: T };

type JsonBody = Record<string, unknown>;

function authHeaders(token?: string): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export async function postJson<T>(
  baseUrl: string,
  path: string,
  body: JsonBody,
  token?: string,
): Promise<JsonResult<T>> {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  return { response, body: (await response.json()) as T };
}

export async function patchJson<T>(
  baseUrl: string,
  path: string,
  body: JsonBody,
  token: string,
): Promise<JsonResult<T>> {
  const response = await fetch(new URL(path, baseUrl), {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  return { response, body: (await response.json()) as T };
}

export async function getJson<T>(
  baseUrl: string,
  path: string,
  token?: string,
): Promise<JsonResult<T>> {
  const response = await fetch(new URL(path, baseUrl), {
    headers: authHeaders(token),
  });

  return { response, body: (await response.json()) as T };
}

export async function deleteJson<T>(
  baseUrl: string,
  path: string,
  token: string,
): Promise<JsonResult<T>> {
  const response = await fetch(new URL(path, baseUrl), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return { response, body: (await response.json()) as T };
}
