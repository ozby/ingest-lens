export const DEPLOY_DOMAIN = "ingest-lens.ozby.dev";

export const PREVIEW_API_SECRET_NAMES = [
  "BETTER_AUTH_SECRET",
  "JWT_SECRET",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
] as const;

export type PreviewLane = {
  lane: "preview-main" | `preview-pr-${number}`;
  prNumber?: string;
  apiHost: string;
  clientHost: string;
  apiWorkerName: string;
  clientWorkerName: string;
};

export function resolvePreviewLane(rawLane: string): PreviewLane {
  if (rawLane === "preview-main") {
    return {
      lane: "preview-main",
      apiHost: `api.preview-main.${DEPLOY_DOMAIN}`,
      clientHost: `preview-main.${DEPLOY_DOMAIN}`,
      apiWorkerName: "ingest-lens-preview-main",
      clientWorkerName: "ingest-lens-client-preview-main",
    };
  }

  const match = /^preview-pr-(\d+)$/.exec(rawLane);
  if (!match) {
    throw new Error(`Unsupported preview lane ${rawLane}; expected preview-main or preview-pr-<n>`);
  }
  const prNumber = match[1];
  return {
    lane: `preview-pr-${Number(prNumber)}`,
    prNumber,
    apiHost: `api.preview-pr-${prNumber}.${DEPLOY_DOMAIN}`,
    clientHost: `preview-pr-${prNumber}.${DEPLOY_DOMAIN}`,
    apiWorkerName: `ingest-lens-preview-pr-${prNumber}`,
    clientWorkerName: `ingest-lens-client-preview-pr-${prNumber}`,
  };
}
