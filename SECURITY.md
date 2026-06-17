# Security Policy

## Reporting a vulnerability

**Do not report security vulnerabilities through public GitHub issues, pull
requests, or discussions.**

Please report privately through one of these channels:

1. **GitHub Security Advisories** (preferred) — open a private advisory at
   <https://github.com/ozby/ingest-lens/security/advisories/new>. This keeps the
   report confidential while it is triaged.
2. **Maintainer contact** — if you cannot use Security Advisories, reach the
   maintainer privately via their [GitHub profile](https://github.com/ozby).

Please include:

- a description of the vulnerability and its impact,
- the affected component (Worker API, intake/mapping, delivery, replay, client,
  infra, etc.),
- reproduction steps or a proof of concept,
- any suggested remediation.

You can expect an initial acknowledgement within a few business days. We will
keep you informed as the issue is triaged and resolved, and will coordinate
disclosure timing with you.

## Supported versions

IngestLens is developed as a continuously deployed application rather than a
versioned library. Security fixes are applied to the latest `main` and the live
deployment. Older states of the codebase are not separately maintained.

| Version              | Supported |
| -------------------- | --------- |
| `main` (latest)      | ✅        |
| older commits / tags | ❌        |

## Handling of secrets

This repository uses `with-secrets` (secret-provider-wrapped) for secret injection and
contains **no `.env` files**. Never commit secrets, tokens, or credentials.
Secret scanning is enforced via secretlint and the repo's CI security workflow.
If you discover a leaked secret, treat it as a vulnerability and report it
through the private channels above.
