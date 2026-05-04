import { describe, expect, it, vi } from "vitest";
import worker from "./worker";
import type { AssetFetcher } from "./worker";

const executionContext = {
  waitUntil: vi.fn(),
};

describe("client auth proxy worker", () => {
  it("proxies /auth/* requests to the configured API origin", async () => {
    const upstreamResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const request = new Request("https://dev.ingest-lens.ozby.dev/auth/get-session", {
        headers: { cookie: "session=abc" },
      });

      const response = await worker.fetch(
        request,
        {
          ASSETS: { fetch: vi.fn() } as AssetFetcher,
          AUTH_PROXY_BASE_URL: "https://api.dev.ingest-lens.ozby.dev",
        },
        executionContext,
      );

      // Framework proxy clones the response and adds Cache-Control: private, no-store (F9)
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const proxiedRequest = fetchMock.mock.calls[0]?.[0] as Request;
      expect(proxiedRequest.url).toBe("https://api.dev.ingest-lens.ozby.dev/auth/get-session");
      expect(proxiedRequest.headers.get("cookie")).toBe("session=abc");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("serves static assets for non-auth requests", async () => {
    const assetsFetch = vi.fn().mockResolvedValue(new Response("asset-ok", { status: 200 }));

    const response = await worker.fetch(
      new Request("https://dev.ingest-lens.ozby.dev/dashboard"),
      {
        ASSETS: { fetch: assetsFetch } as AssetFetcher,
        AUTH_PROXY_BASE_URL: "https://api.dev.ingest-lens.ozby.dev",
      },
      executionContext,
    );

    expect(await response.text()).toBe("asset-ok");
    expect(assetsFetch).toHaveBeenCalledTimes(1);
  });
});
