---
type: guide
last_updated: "2026-04-21"
---

# Parallel execution

Parallelism is a sharp tool. Used well, it compresses a day into an hour.
Used badly, it multiplies failure modes, corrupts shared state, and makes
results impossible to reason about. The rules below are what a senior
engineer does, not what a concurrency library default does.

## When to parallelize

- **Independent reads.** Multiple files, multiple repos, multiple API lookups with no shared write target.
- **Independent workspaces.** Running tests across packages that do not import each other.
- **Independent fact-checks.** Inspecting N blueprints against repo reality.

## When NOT to parallelize

- **Writes to the same file or same table.** Serialize.
- **Commands with side effects on shared infra.** `pulumi up`, DNS edits, DB migrations — one at a time.
- **Dependency chains.** B depends on A's output → run sequentially.
- **Exploratory work.** If you don't know what you're looking for, parallel lanes multiply noise. Read once, slowly, then fan out.

## Agent-tool rules

- **Tool calls in one message** — prefer this for independent reads/queries. The harness batches them efficiently.
- **Subagent fan-out** — use when each lane has a substantial, self-contained task and a tight return shape. Each subagent should answer one question.
- **Background processes** — start with a clear lifecycle (PID, log file, expected termination condition). Never leave a background process running at the end of a session.

## Bounding concurrency

- **Default: 3 lanes.** Enough to compress work without saturating rate limits.
- **API quota–bound work: ≤2.** Leave headroom.
- **IO-bound fan-out over many items: chunked.** Process in batches of 10–20, not 500-at-once. Emit progress.
- **CPU-bound: ≤ cores - 1.** Leave the scheduler a breather.

## Failure semantics

- **Fail fast** when any lane reports a blocker. Cancel the others.
- **Fail partial** when one lane's failure is independent (e.g. one of N file analyses). Collect results and report which lanes failed.
- **Never present partial results as complete.** Always surface the gap.

## Evidence and reporting

- Every parallel lane must end with a concrete artifact: a file, a summary block, a commit.
- Surface the **slowest** lane's bottleneck in your summary — it's the only one that matters for next time.
- If a lane succeeded but produced an unexpected side effect, flag it. Quiet surprises become incidents.
