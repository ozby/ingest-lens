# Blueprints

Durable implementation plans for this monorepo. Every non-trivial initiative
lives here as a blueprint before it is merged to `main`. A blueprint is the
single source of truth for why a change is happening, what "done" looks like,
and how parallel work is sequenced.

## Lifecycle

Blueprints move through directory-based states. The `status` frontmatter in
`_overview.md` must match the directory the blueprint currently lives in.

| Directory                 | Status        | Meaning                                              |
| ------------------------- | ------------- | ---------------------------------------------------- |
| `blueprints/planned/`     | `planned`     | Approved, waiting to be picked up.                   |
| `blueprints/in-progress/` | `in-progress` | Actively being executed on a branch.                 |
| `blueprints/parked/`      | `parked`      | Approved but deliberately deferred.                  |
| `blueprints/completed/`   | `completed`   | Executed, merged, and verified.                      |
| `blueprints/archived/`    | `archived`    | Superseded or withdrawn; kept for historical record. |

Transitions are plain `git mv` operations. The `$plan-refine` skill audits the
blueprint against the current repo before each transition.

Task-level blocking is tracked inside the blueprint itself: set a task
`**Status:**` to `blocked` and add a `**Blocked:**` reason. There is no
blueprint-level `blocked` status.

## Layout

Each blueprint is a directory named with a kebab-case slug. The canonical
entry point is `_overview.md`.

```text
blueprints/
  planned/
    <slug>/
      _overview.md            # canonical blueprint (required)
      research/               # optional: source captures, fact-check notes
      artifacts/              # optional: generated schemas, fixtures
```

The `_overview.md` frontmatter uses the template at
`docs/templates/blueprint.md`.

## Author a new blueprint

Invoke `$plan <slug> [goal]`. The skill will:

1. Read this README, the template, and the repo facts it needs.
2. Write `blueprints/planned/<slug>/_overview.md` with a full phase/task pool.
3. Register the slug in the blueprint index below via a follow-up edit.

## Harden a blueprint before execution

Invoke `$plan-refine <slug>`. The skill will:

1. Verify every referenced file path, workspace, command, and dependency.
2. Tighten vague acceptance criteria into checkable outcomes.
3. Confirm same-wave file conflicts are zero.
4. Update `last_updated` and append a `Refinement Summary` section.

## Active blueprints

| Slug                                 | Status  | Theme                                            |
| ------------------------------------ | ------- | ------------------------------------------------ |
| `integration-payload-mapper-dataset` | planned | AI dataset + eval pack for payload mapping       |
| `vite-plus-migration`                | planned | Replace Turbo with Vite Plus (`vp`)              |
| `pnpm-catalogs-adoption`             | planned | Centralize versions via `pnpm-workspace` catalog |
| `cloudflare-pulumi-infra`            | planned | Pulumi-managed Cloudflare Workers + Hyperdrive   |
| `doppler-secrets`                    | planned | Doppler config inheritance model                 |
| `stryker-mutation-guardrails`        | planned | Mutation-score thresholds per package            |
| `ci-hardening`                       | planned | GitHub Actions matrix, caching, required gates   |
| `commit-hooks-guardrails`            | planned | Husky + lint-staged + commitlint + secretlint    |
| `agents-md-principal-rewrite`        | planned | Principal-level AGENTS.md + lore protocol        |
| `adr-lore-commit-protocol`           | planned | ADR system with commit trailer vocabulary        |
| `workers-hono-port`                  | planned | Hard-cut Express/Node → Hono on CF Workers       |

## Validation

Run `pnpm blueprint:validate` to check:

- Every blueprint directory contains `_overview.md`.
- Frontmatter `status` matches the directory it lives in.
- Every `**Files:**` path uses a known workspace prefix.
- Cross-blueprint references point to slugs that exist.

The legacy `.omx/plans` validator still runs for backward compatibility.
