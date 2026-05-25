export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface ClientWorkerEnv {
  ASSETS: AssetFetcher;
  AUTH_PROXY_BASE_URL: string;
}

function asClientWorkerEnv(env: Record<string, unknown>): ClientWorkerEnv {
  return env as unknown as ClientWorkerEnv;
}

function buildProxyUrl(requestUrl: string, upstreamBase: string): URL {
  const upstreamUrl = new URL(upstreamBase);
  const incomingUrl = new URL(requestUrl);
  upstreamUrl.pathname = incomingUrl.pathname;
  upstreamUrl.search = incomingUrl.search;
  return upstreamUrl;
}

async function proxyRequest(request: Request, upstreamBase: string): Promise<Response> {
  const upstreamUrl = buildProxyUrl(request.url, upstreamBase);
  const headers = new Headers(request.headers);
  headers.set("host", upstreamUrl.host);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstreamResponse = await fetch(
    new Request(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      ...(hasBody ? ({ duplex: "half" } as const) : {}),
    }),
  );

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("Cache-Control", "private, no-store");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

function shouldProxy(pathname: string): boolean {
  return pathname.startsWith("/auth/") || pathname.startsWith("/api/");
}

// Keep auth and API requests same-origin in local/browser runs while still
// falling through to SPA assets for application routes.
export default {
  async fetch(
    request: Request,
    env: Record<string, unknown>,
    _ctx?: { waitUntil(promise: Promise<unknown>): void },
  ) {
    const url = new URL(request.url);
    const clientEnv = asClientWorkerEnv(env);

    if (shouldProxy(url.pathname)) {
      return proxyRequest(request, clientEnv.AUTH_PROXY_BASE_URL);
    }

    return clientEnv.ASSETS.fetch(request);
  },
};
