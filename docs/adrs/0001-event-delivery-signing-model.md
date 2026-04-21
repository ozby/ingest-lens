---
type: adr
last_updated: "2026-04-22"
---

# ADR 0001: Event Delivery Signing Model

- **Status:** accepted
- **Date:** 2026-04-22
- **Decider(s):** Ozby

## Context

The platform fans out webhook events to subscriber-controlled endpoints
(see `apps/api-server/src/platform/services/deliveryDispatcher.ts`). Each
subscriber registers an endpoint URL; the platform must give that endpoint
a way to verify that a delivery genuinely originated from this platform and
was not tampered with or replayed by a third party.

Constraints in play:

- Consumers run arbitrary stacks — no shared PKI, no mutual TLS, no
  certificate provisioning
- Every delivery attempt (including retries) must be independently
  verifiable so consumers can detect replays without coupling to sequence
  numbers
- The platform targets Cloudflare Workers (`apps/api-server/src/platform/`)
  where the Web Crypto API is available but native Node crypto bindings are
  not guaranteed

The signing implementation lives in
`apps/api-server/src/platform/domain/signing.ts`.

## Decision

We sign **every delivery attempt** with HMAC-SHA256. The HMAC is computed
over the delivery payload together with an attempt-specific nonce, using a
**per-subscription secret** stored at subscription creation time. The
resulting signature is sent as an HTTP header (`X-Hub-Signature-256`) on
every outbound delivery request.

Key choices within this decision:

1. Sign per-attempt (not per-event) so retries carry independent, fresh
   signatures
2. Use a per-subscription secret (not a global platform key) so a
   compromised subscriber cannot forge deliveries to other subscribers

## Consequences

### Positive

- Consumers can verify origin with a single HMAC check — no PKI, no
  certificate rotation
- Per-subscription secrets mean a leaked secret is scoped to one subscriber
- Web Crypto `SubtleCrypto.sign` works on Cloudflare Workers without
  additional polyfills

### Negative

- Subscribers must securely store the shared secret; if it leaks, an
  attacker can forge deliveries to that subscriber
- Rotating a subscription secret requires re-provisioning all consumers
  of that subscription (no zero-downtime key rotation today)

### Neutral / follow-ups

- Replay protection beyond the HMAC (e.g., timestamp freshness window) is
  not enforced today — document as a known gap
- ADR-0003 covers how the subscription secret is initially provisioned
  through the API-key auth layer

## Alternatives considered

- **Payload encryption (AES-GCM)** — rejected because consumers need
  origin assurance, not confidentiality; encryption adds key-management
  overhead (IV handling, key wrapping) for no benefit in this use case
- **Sign-once, embed nonce in headers** — rejected because the nonce would
  not be part of the signed payload, enabling a MITM to replay the original
  signature with a swapped body
- **Asymmetric signing (Ed25519 / RS256)** — rejected for v1 because it
  requires distributing a public key out-of-band and adds verification
  complexity for consumers; viable upgrade path once the platform has a
  JWKS endpoint
