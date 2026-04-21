---
type: adr
last_updated: "2026-04-22"
---

# ADR 0003: Auth Story (v1 API Keys)

- **Status:** accepted
- **Date:** 2026-04-22
- **Decider(s):** Ozby

## Context

The platform exposes two HTTP surfaces:

1. **Control plane** — manage workspaces, topics, subscriptions
   (`apps/api-server/src/platform/http/createControlPlaneApp.ts`)
2. **API plane** — receive inbound webhook events for routing
   (`apps/api-server/src/platform/http/createApiApp.ts`)

Callers are trusted third-party integrations (ATS, HRIS vendors) and
workspace-operator tooling. The platform needs to:

- Identify the caller's workspace so events can be routed to the correct
  subscriber set
- Reject unauthenticated requests before any processing occurs
- Be implementable without a dedicated auth service or external IdP for v1

Platform config is loaded from `apps/api-server/src/config/index.ts`.

## Decision

Use **static API-key authentication** for v1: each workspace is provisioned
with a bearer token (high-entropy random string). Callers include it in the
`Authorization: Bearer <key>` header. The platform validates the token on
every request.

The JWT upgrade path is explicitly documented below so the decision to
defer JWTs is visible and reversible.

## Consequences

### Positive

- Zero external dependencies — no Auth0, no Okta, no JWKS endpoint to
  serve
- Simple consumer integration: one environment variable, one header
- Easy to test: deterministic token in CI via Doppler config

### Negative

- Static bearer tokens cannot carry claims (expiry, scopes, user identity)
  without re-implementing JWT mechanics from scratch
- Token rotation requires re-provisioning all callers — there is no
  silent refresh
- A leaked token grants full workspace access until manually revoked;
  no short-lived credential TTL

### Neutral / follow-ups

- **JWT upgrade path:** replace static token lookup with a `jose` /
  `hono/jwt` middleware that validates a signed JWT against the workspace's
  public key; scopes encoded in claims replace the coarse workspace-level
  access today
- Per-topic API keys (finer-grained than per-workspace) are a viable
  intermediate step before full JWT adoption
- mTLS is documented as rejected (see below) but remains viable for
  machine-to-machine integrations if the platform gains a certificate
  provisioning story

## Alternatives considered

- **OAuth2 device flow** — rejected because callers are server-side
  integrations, not interactive users; device flow is designed for
  user-facing auth and adds unnecessary redirect/consent ceremony
- **mTLS (mutual TLS)** — rejected because it requires certificate
  provisioning infrastructure on both sides; viable for high-assurance
  integrations but disproportionate to v1 scope
- **JWT (RS256 / ES256) from day one** — rejected because it requires
  serving a JWKS endpoint and managing key pairs before the platform has
  a stable deployment; documented as the intended upgrade path once the
  Cloudflare Workers deployment is stable
