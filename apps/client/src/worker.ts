import { createAuthProxyHandler } from "@webpresso/webpresso/auth/worker-proxy";

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

// Replaces hand-written proxyAuthRequest — framework adds F9 (Cache-Control: private, no-store)
// and F4 (Safari ITP Set-Cookie preservation) that the hand-written version lacked.
export default createAuthProxyHandler({
  assets: (env) => asClientWorkerEnv(env).ASSETS,
  upstream: (env) => asClientWorkerEnv(env).AUTH_PROXY_BASE_URL,
});
