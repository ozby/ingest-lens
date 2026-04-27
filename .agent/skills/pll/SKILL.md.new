---
name: pll
description: Blueprint-aware parallel execution adapter over ultrawork/subagents. If OMX isn't installed, the skill uses the `local-worktree` backend (default for repos without OMX).
---

# PLL Skill — Blueprint-Aware Parallel Execution

Use this skill when the user invokes `/pll` or asks for Blueprint-aware parallel execution.

`/pll` is not a standalone runner. It is the operator-facing adapter over the same shared execution model used by `ak blueprint exec`: both surfaces consume the same Blueprint-backed launch spec, backend vocabulary, and runtime-state bridge, but `/pll` stays manual and operator-facing.

`/pll`:

1. understands Blueprint/task dependencies
2. updates `ak blueprint` lifecycle state honestly
3. delegates generic parallel fan-out to the engine layer such as `$ultrawork` or host-native subagents

> **Backends**: `/pll` can delegate to `omx-team` or `omx-pll-interactive` when OMX is installed. If OMX isn't installed, the skill uses the `local-worktree` backend (default for repos without OMX).

## Responsibilities

1. **Input parsing**
   - Accept inline task lists, comma-separated strings, or file paths.
   - Treat blueprint paths under `blueprints/` as lifecycle-backed execution.
2. **Blueprint lifecycle**
   - Use `ak blueprint start`, `ak blueprint task ...`, and `ak blueprint finalize` for durable state.
   - Never use `ak blueprint move` as the normal execution primitive.
   - Keep the lifecycle semantics aligned with `ak blueprint exec`; do not invent a separate `/pll`-only plan model.
3. **Dependency-aware batching**
   - Compute ready work from explicit dependencies and obvious blocking relationships.
   - Prioritize critical-path or high-fan-out work when choosing the next batch.
4. **Engine delegation**
   - Hand independent work to the current engine layer (`$ultrawork`, subagents, or equivalent runtime-native parallel lanes).
   - Do not promise a fixed active-agent count across runtimes.
5. **Verification discipline**
   - Require repo verification before marking blueprint tasks complete.
6. **Shared execution model**
   - Treat `/pll` as the interactive/manual front door for the same control-plane contract that `ak blueprint exec` uses.
   - Reuse the same backend names, progress bridge semantics, and truthfulness rules.

## Concurrency Limits

| Scope | Guidance |
| --- | --- |
| Default batches | Use the smallest parallelism that still keeps safe independent lanes busy |
| Test-heavy tasks | Keep concurrency conservative |
| Build/deploy tasks | Keep concurrency conservative |

## Deadlock and Failure Handling

- If no tasks remain ready but some are blocked, report the blocking tasks and their dependencies.
- Failed tasks stay blocked with reasons; downstream work remains blocked unless explicitly safe to continue.
- If lifecycle mutation fails, stop instead of continuing with stale plan state.

## When **NOT** to use

- Small, strictly serial work where `/plan` or direct execution is simpler.
- Situations where you only need generic parallel fan-out and do not need Blueprint lifecycle/state awareness; use `$ultrawork` directly there.

## Quick Start Examples

```bash
/pll "lint auth, lint utils, typecheck api [depends: lint auth], test api [depends: typecheck api]"
/pll tasks.md --max=6
/pll blueprints/in-progress/new-launch/_overview.md
```
