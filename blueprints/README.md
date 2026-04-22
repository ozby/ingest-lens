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

| Slug                         | Status  | Complexity | Theme                                                                        | Depends on                |
| ---------------------------- | ------- | ---------- | ---------------------------------------------------------------------------- | ------------------------- |
| `cf-rate-limiting`           | planned | XS         | Edge token-bucket limiter for authenticated Worker routes                    | —                         |
| `cf-queues-delivery`         | planned | M          | Replace fire-and-forget push with Queues + DLQ for direct and topic delivery | —                         |
| `analytics-engine-telemetry` | planned | S          | Delivery-attempt telemetry from the queue consumer                           | `cf-queues-delivery`      |
| `durable-objects-fan-out`    | planned | L          | TopicRoom Durable Object + WebSocket hibernation                             | `cf-queues-delivery`      |
| `message-replay-cursor`      | planned | M          | Postgres sequence numbers + TopicRoom cursor replay                          | `durable-objects-fan-out` |

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

## Gap audit snapshot (2026-04-22)

| Slug                         | Readiness           | Main gap                                                               | Why it is or is not the next pickup                                                                                           |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `cf-queues-delivery`         | ready-next          | Queue resource provisioning is still a deploy prerequisite in `infra/` | Highest leverage and unblocks telemetry + DO fan-out. Best first implementation candidate.                                    |
| `cf-rate-limiting`           | ready-optional      | Needs a real rate-limit namespace ID and plan confirmation             | Useful edge hardening, but it does not unblock the core delivery architecture. Prioritize only if abuse is already happening. |
| `analytics-engine-telemetry` | blocked-by-upstream | Needs the delivery consumer introduced by `cf-queues-delivery`         | Correctly sequenced after queue delivery lands.                                                                               |
| `durable-objects-fan-out`    | blocked-by-upstream | Needs `cf-queues-delivery` queue payload + consumer path               | Valuable, but not first. Real-time fan-out should sit on top of reliable delivery, not precede it.                            |
| `message-replay-cursor`      | blocked-by-upstream | Needs `durable-objects-fan-out` plus Worker migration bootstrap        | Correctly last in the wave because it extends the DO + queue path rather than creating it.                                    |

### Recommended next pickup

If implementation starts now, the first blueprint that should move from
`planned/` to `in-progress/` is **`cf-queues-delivery`**.

Why:

1. It fixes the biggest correctness gap in the shipped Worker code: silently
   dropped push deliveries.
2. It unblocks both Wave 2 blueprints (`analytics-engine-telemetry` and
   `durable-objects-fan-out`).
3. It already matches the real codebase after refinement: both
   `routes/message.ts` and `routes/topic.ts` need the same fire-and-forget
   replacement.
4. It does not require inventing a new persistence stack; it keeps Postgres via
   Hyperdrive as the source of truth.

Do **not** move a blueprint to `in-progress/` until work actually starts on a
branch. The recommendation above is sequencing guidance, not a lifecycle-state
change by itself.

## Validation

Run `bun ./scripts/validate-blueprints.ts` to check:

- Every blueprint directory contains `_overview.md`.
- Frontmatter `status` matches the directory it lives in.
- Cross-blueprint references point to slugs that exist.

The legacy `.omx/plans` validator still runs for backward compatibility.
