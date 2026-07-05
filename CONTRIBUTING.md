# Contributing to IngestLens

Thanks for your interest. IngestLens runs on Cloudflare Workers and uses
[vite-plus](https://github.com/webpresso) (`vp`) as its workspace runner, with
`wp secrets run` (secret-provider-wrapped) for secret injection. There are **no `.env`
files** — never add one.

## Prerequisites

- Node `>=24`
- the repo package manager through `vp install`
- Bun (used by the repo's scripts)
- `vp` + the repo-local `wp` wrapper exposed after install

`vp install` pulls in the repo's pinned `@webpresso/agent-kit` dependency. If
shared tooling drifts later, prefer `wp ...` directly when available,
otherwise `vp exec wp ...` inside the repo.

## Setup

```bash
vp install
```

This repo no longer materializes project-local Claude/Codex/OpenCode host
surfaces. If shared tooling drifts, diagnose with the relevant `wp audit ...`
command rather than reintroducing repo-local host scaffolding.

Start the dev server (secrets injected) or offline:

```bash
wp secrets run --sink dev-server --profile preview -- vp run dev
vp run dev                  :offline (no secret injection)
```

## Verify before you open a PR

Run the fast contributor check locally — it needs no secrets:

```bash
vp run lint          # oxlint + per-package lint
vp run check-types   # tsc, no type errors
vp run test          # vitest suites
```

The full maintainer check mirrors CI. Some steps require secrets or a Neon E2E
branch and are **maintainer-only**:

```bash
vp check                                      # aggregate lint + types + format
vp run build                                  # all packages build
wp audit docs-frontmatter                     # docs:check
wp audit blueprint-lifecycle      # blueprints:check
vp run e2e --suite foundation                 # maintainer-only; needs a Neon E2E branch (or --suite full)
```

## Planned work goes through blueprints

Non-trivial work is tracked as blueprints under `blueprints/`. The blueprint
lifecycle is gated by `wp audit blueprint-lifecycle`. Do not
hand-edit generated agent surfaces (`.agent/`, `.cursor/`,
`catalog/`, `agent-rules/`, `agent-skills/`,
`blueprints/` runtime files) — those are kept in sync by the agent-kit
symlinker.

## Branch and commit conventions

- Branch off `main`; never commit directly to `main`.
- Commit messages follow the **Lore Commit Protocol**: a conventional-commit
  subject (e.g. `feat(delivery): ...`, `fix(ci): ...`, `docs(blueprints): ...`)
  plus structured git trailers that record the decision and how it was
  verified. Commits are validated by commitlint and the repo's commit hooks.

Trailer format (match existing `git log`):

```
<type>(<scope>): <subject>

<body explaining the decision>

Verified:
- <command or check that was run, e.g. wp test --file ...>
- <command or check>

Co-Authored-By: <Name> <email>
```

## Pull request expectations

- Keep PRs focused on one change.
- The fast contributor check must pass locally before review.
- Describe the change and link any relevant blueprint or ADR.
- For behavior changes, include or update the proving test (prefer an E2E
  journey under `apps/e2e/journeys/` for user-facing flows).
- See [SECURITY.md](SECURITY.md) for reporting vulnerabilities — do **not** open
  a public issue or PR for a security report.

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
