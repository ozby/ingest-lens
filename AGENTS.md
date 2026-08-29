<!-- >>> managed by webpresso (operating-contract) -->

# Operating Contract

## Setup after clone

```bash
vp install && wp run setup:agent
```

The agent-kit catalog is the source of truth for generated agent surfaces; `wp`
owns the end-user command surface.

- Optional agent tools: `wp install codex|claude-code|opencode` or `wp install oh-my opencode` (`openagent`); WP scopes use `wp update`.
- `wp setup` repairs the managed `.gitignore` block for regenerated surfaces.
- Keep `@webpresso/app-config` as the only local Webpresso config package.
- `.agent/rules/` is authoritative policy: read the rule matching your task.
- Track instruction sources; ignore other generated/runtime surfaces (`.agents/`, `.codex/`, `.opencode/`).
- Keep the generated default `AGENTS.md` under 8 KB.

Codex routing instruction surface:
<wp_instruction_surface host="codex" artifact="AGENTS.md" source="wp_routing">
<host_contract>
<native_tool_families>blueprint, quality, pr-workflow, release, review, session-memory, tool-discovery, ui, worktree, ultragoal, worker</native_tool_families>
<stdout_noop>Codex hook commands with no action write {} on stdout; durable guidance belongs in AGENTS.md.</stdout_noop>
<lifecycle_notes>
<note>Codex reads repository instruction files for durable guidance.</note>
<note>Unsupported managed lifecycle names are documented in the host capability matrix, not emulated here.</note>
</lifecycle_notes>
<public_support>Public support: first-class Codex instruction artifact.</public_support>
</host_contract>
</wp_instruction_surface>

## Plan

Use blueprints for non-trivial work. Keep specs, tasks, dependencies, checks,
and acceptance criteria current in [`blueprints/`](./blueprints/)
lifecycle directories.

For non-trivial changes, create and start a blueprint before edits. Never edit
`main`. Non-`*.md` PRs need one unless `Blueprint-exempt: <reason>` or Dependabot-only.

Use `wp ultragoal` and `wp worktree`; never use a repo-local launcher as the normal command surface.

Catalog-owned surfaces:

- `.agent/commands/` — slash-command sources
- `.agent/skills/` — generated/projected skills; edit the catalog, not generated copies

## Implement

- Command routing is `wp`, then `vp`, then `pnpm`; use each only when the prior facade has no equivalent.
- Prefer repo scripts/wrappers over ad-hoc commands.
- Repo hook/tool denial: switch to the named facade/lifecycle; do not retry raw.
- Reuse nearby patterns; apply DRY, SOLID, YAGNI, and KISS.
- No hardcoded relative paths in executable code or config; derive from an explicit absolute anchor.
- Prefer the exact native MCP route when one exists; otherwise use the matching
  `wp` command.
- Legacy-removal work deletes obsolete implementation, prose, fixtures, and
  assertions. Update positive authority and expected-output contracts; do not
  add permanent tests or audits that enumerate retired tokens. Prefer net
  deletion across affected implementation, test, and instruction files.

Hook invariant: global hooks use the canonical contract; skill hooks never enter
host settings. Bound hot paths; never raise timeouts or hide work asynchronously.

## Verify

Before completion, run narrow MCP/`wp` checks: typecheck, lint/format, affected tests, policy, docs/blueprint, and `wp sync --check` after catalog changes. Fix root causes or record blockers.

## Communicate

Explain rationale, tradeoffs, and verification. Before opening/updating a PR, prefill model disclosure, `Review artifact/verdict`, and session id (`wp session-info`), or add `Review-skip: SKIP <specific reason>` / `Session-skip: SKIP <reason>`; the PR description contract enforces this. Record durable decisions in the ADR/planning surface.

<!-- <<< managed by webpresso (operating-contract) -->

<!-- >>> user-owned (repo-customizations) -->

## Repo-specific customizations

Command routing is a hard invariant: prefer `wp`, then `vp`, then `pnpm`.
Use `vp` only when `wp` has no equivalent, and raw `pnpm` only when neither
facade can perform the operation. All documentation, instructions, scripts,
and workflow examples must follow this hierarchy without exception.

### Tech stack addendum

- Cloudflare Workers + Wrangler
- React + Vite
- Vitest
- TypeScript
- Pulumi
- configured secret provider
- Webpresso/Agent Kit (`wp`, blueprints, audits)

### Architecture governance

- Architecture source of truth: `docs/architecture.md`
- Machine-checkable contract: `docs/architecture.contract.json`
- Active blueprints must link both files
- Architecture-changing blueprints must include `## Architecture before` and `## Architecture after`
- Local drift check: `python3 scripts/check_architecture_drift.py`
- Shared target surface once released from agent-kit: `wp audit architecture-drift --root .`

<!-- <<< user-owned (repo-customizations) -->

<!-- >>> managed by webpresso (planning-and-release) -->

## Safety boundaries

- Do not commit secrets or credentials.
- Do not persist secret files (`.env*`, `.dev.vars*`).
- Use `wp secrets doctor`/`wp secrets run` for secret-scoped commands.
- Keep secret/path checks on shared audit surfaces when available.
- Do not commit agent surfaces (`.agent/`, `.agents/`, `.cursor/`, `.codex/`, `.opencode/`).
- Do not hand-edit generated or derived surfaces; edit the catalog in agent-kit.
- Do not push directly to `main`; use PRs and keep CI green.
- Do not bypass hooks or verification gates.
- Treat publishable tarballs as public disclosure surfaces.
- Surface conflicts between this file and deeper repo instructions instead of silently ignoring either.

## Durable planning surface

- Materialized by setup: blueprint lifecycle directories under `blueprints/`; put PRDs/tests beside them.
- Generated on demand (not created by setup): boundary contracts at `.agent/planning/contracts/`, state at `.agent/planning/state/`, notes at `.agent/planning/notepad.md`, memory at `.agent/planning/project-memory.json`.
- Update boundary contracts before claiming readiness when ownership, build boundaries, or package consumption changes.

## Releases

Release-visible package changes use Changesets. Default to `patch`; do not
bump versions or publish locally.

```bash
wp run changeset:status
```

Protocol: `.agent/rules/changeset-release.md`

## Package conventions

- No `../` parent-relative imports — use workspace deps + subpath exports.
- No `.mjs` source files — write `.ts`.
- Use `wp` > `vp` > `pnpm`; no `npm install`/`npx` setup guidance.
- All packages: `"type": "module"`.

Full details: `.agent/rules/package-conventions.md`

## Repository map

- `@repo/e2e` — `apps/e2e`
- `@repo/infra` — `infra`
- `@repo/lab` — `apps/lab`
- `@repo/lab-core` — `packages/lab-core`
- `@repo/lab-s1a-correctness` — `apps/lab/scenarios/s1a-correctness`
- `@repo/lab-s1b-latency` — `apps/lab/scenarios/s1b-latency`
- `@repo/logger` — `packages/logger`
- `@repo/test-utils` — `packages/test-utils`
- `@repo/types` — `packages/types`
- `@repo/typescript-config` — `packages/config-typescript`
- `@repo/workers` — `apps/workers`
- `@repo/wrangler-sync` — `packages/wrangler-sync`
- `client` — `apps/client`
- `ingest-lens` — `.`

## Tech stack

- Playwright
- React
- TypeScript
- Vitest

<!-- <<< managed by webpresso (planning-and-release) -->

<!-- >>> user-owned (escalation-map) -->

## Escalation map

- Client UI (`apps/client`) — frontend lane owner / UI maintainer
- Workers API (`apps/workers`) — backend lane owner / Workers maintainer
- Infra + deploy (`infra`, Wrangler, Pulumi, configured secret provider) — infrastructure operator
- E2E + Neon branch tooling (`apps/e2e`) — QA / release lane owner
- Agent/runtime surfaces (`.agent`, audits, blueprints, CI guardrails) — repo operator

<!-- <<< user-owned (escalation-map) -->
