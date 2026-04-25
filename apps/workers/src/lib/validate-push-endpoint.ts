/**
 * SSRF mitigation for pushEndpoint URLs (FIX-1 / CSO audit).
 *
 * Allows only https:// scheme and rejects bare IPs or hostnames that resolve
 * to loopback, link-local, private, or multicast ranges.  DNS-based SSRF
 * (CNAME → private IP) is NOT covered here — that requires egress firewall
 * rules at the Cloudflare account level.
 */

type ValidationOk = { valid: true };
type ValidationFail = { valid: false; reason: string };

export type PushEndpointValidationResult = ValidationOk | ValidationFail;

const PRIVATE_IP_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // Loopback 127.0.0.0/8
  { label: "loopback", re: /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/ },
  // Link-local 169.254.0.0/16
  { label: "link-local", re: /^169\.254\.\d{1,3}\.\d{1,3}$/ },
  // Private 10.0.0.0/8
  { label: "private (10/8)", re: /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/ },
  // Private 172.16.0.0/12  (172.16–172.31)
  {
    label: "private (172.16/12)",
    re: /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  },
  // Private 192.168.0.0/16
  { label: "private (192.168/16)", re: /^192\.168\.\d{1,3}\.\d{1,3}$/ },
  // Multicast 224.0.0.0/4  (224–239)
  { label: "multicast", re: /^(22[4-9]|23\d)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/ },
];

const BLOCKED_HOSTNAMES: Array<{ hostname: string; reason: string }> = [
  { hostname: "localhost", reason: "pushEndpoint hostname 'localhost' is not allowed" },
  {
    hostname: "metadata.google.internal",
    reason: "pushEndpoint hostname 'metadata.google.internal' is not allowed",
  },
  {
    hostname: "169.254.169.254",
    reason: "pushEndpoint resolves to a link-local address, which is not allowed",
  },
];

export function validatePushEndpoint(url: string): PushEndpointValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "pushEndpoint is not a valid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "pushEndpoint must use the https:// scheme" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block exact hostnames (with specific reasons for the error message)
  for (const entry of BLOCKED_HOSTNAMES) {
    if (hostname === entry.hostname) {
      return { valid: false, reason: entry.reason };
    }
  }

  // Block *.local
  if (hostname.endsWith(".local")) {
    return { valid: false, reason: "pushEndpoint hostnames ending in .local are not allowed" };
  }

  // Block bare RFC 1918 / loopback / link-local / multicast IP addresses
  for (const { label, re } of PRIVATE_IP_PATTERNS) {
    if (re.test(hostname)) {
      return {
        valid: false,
        reason: `pushEndpoint resolves to a ${label} address, which is not allowed`,
      };
    }
  }

  return { valid: true };
}
