export function previewUrl(stack: string, domain: string): string {
  if (stack === "prd") return `https://api.${domain}`;
  if (stack.startsWith("preview-pr-")) {
    const pr = stack.replace("preview-pr-", "");
    return `https://pr-${pr}.api.${domain}`;
  }
  return `https://${stack}.api.${domain}`;
}
