export function getE2EBaseUrlOrThrow(testFile: string): string {
  const baseUrl = process.env.E2E_BASE_URL;
  if (!baseUrl) {
    throw new Error(`E2E_BASE_URL is required for ${testFile}`);
  }
  return baseUrl;
}
