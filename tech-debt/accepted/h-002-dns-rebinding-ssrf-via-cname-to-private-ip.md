---
type: tech-debt
status: accepted
severity: medium
category: security
review_cadence: quarterly
last_reviewed: "2026-04-25"
created: "2026-04-25"
linked_blueprints: []
affected_modules:
  - apps/workers/src/lib/validate-push-endpoint.ts
  - apps/workers/src/routes/queue.ts
---

# DNS-rebinding SSRF via CNAME to private IP

## Problem

`validatePushEndpoint` in `apps/workers/src/lib/validate-push-endpoint.ts`
blocks bare private IPs and known-bad hostnames at queue-creation time, but
cannot block a hostname that resolves to a private IP via a CNAME chain
(e.g. `evil.attacker.com CNAME → 192.168.1.1`). The check runs at
creation time on the URL string only — DNS resolution happens later in the
delivery consumer when the Worker calls `fetch(pushEndpoint)`.

On Cloudflare Workers' global network the RFC 1918 ranges are not normally
routable, so the practical impact is lower than on a self-hosted server, but
the vector remains open for metadata endpoints or internal CF services.

## Remediation (requires CF account-level config — cannot be done in code)

**Step 1 — Cloudflare WAF custom rule (Egress)**

In the Cloudflare dashboard → Security → WAF → Custom Rules, create an
egress firewall rule on the Worker's zone:

```
Rule name: Block SSRF from pushEndpoint delivery
Expression:
  (http.request.full_uri matches "^https?://([0-9]{1,3}\.){3}[0-9]{1,3}" and
   cf.edge.server_ip in {"10.0.0.0/8" "172.16.0.0/12" "192.168.0.0/16" "127.0.0.0/8" "169.254.0.0/16"})
Action: Block
```

Alternatively, use Cloudflare's **Workers egress policies** (available on
Enterprise) to restrict outbound `fetch()` to an allowlist of domains.

**Step 2 — In-code mitigation (partial, already shipped)**

`validate-push-endpoint.ts` already blocks:

- Non-https schemes
- Bare loopback / link-local / private / multicast IPs
- `localhost`, `*.local`, `metadata.google.internal`

**Step 3 — Monitoring**

Add a log line to `deliveryConsumer.ts` when `fetch(pushEndpoint)` receives a
non-2xx response from a private-range IP. Alert on repeated failures from the
same queue owner.

## When to close

Close this entry once Cloudflare WAF egress rules are configured on the
production zone AND a Workers egress allowlist is in place. Verify with a
canary queue pointing to a mock internal service — delivery should be blocked
at the CF edge before the Worker makes the TCP connection.
