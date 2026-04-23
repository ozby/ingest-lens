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

- [`client-route-code-splitting`](./planned/client-route-code-splitting/_overview.md) — split the client SPA at route boundaries to remove the Vite large-chunk warning and add a dependency-free bundle budget gate.

## Execution roadmap

For the current wave order, dependency chain, and which blueprints are ready-next, see [`ROADMAP.md`](../ROADMAP.md) at the repo root.

## Research alignment notes

The current blueprint set deliberately **does not** include separate plans for:

- Cloudflare PubSub — retired; product is dead / 404 as of 2026-04-22.
- D1 for topic / subscription metadata — deferred as YAGNI while Postgres via
  Hyperdrive remains the durable data plane.
- KV as an API-key cache — deferred as YAGNI for the current JWT-based auth
  path.
- Pipelines — confirmed open beta and useful later, but not part of the
  current implementation wave.

See `docs/research/cloudflare-architecture-2026-04.md` for the fact-checked
research artifact these blueprints implement.

## Gap audit snapshot

Superseded by [`ROADMAP.md`](../ROADMAP.md). See the roadmap for the current execution order, dependency chain, and readiness assessment.

## Validation

Run `pnpm blueprints:check` to check:

- Every blueprint directory contains `_overview.md`.
- Frontmatter `status` matches the directory it lives in.
- Legacy `.omx` plan, contract, and lifecycle artifacts remain internally consistent when present.
