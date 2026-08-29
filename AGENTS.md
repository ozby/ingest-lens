<!-- >>> managed by webpresso (operating-contract) -->

# Operating Contract

## Setup after clone

```bash
wp install && wp run setup:agent && wp sync  # separate, idempotent steps
```

agent-kit catalog is SSOT for generated agent surfaces; Webpresso CLI owns the end-user command surface.

- Optional agent tools: `wp install codex|claude-code|opencode` or `wp install oh-my opencode` (`openagent`); WP scopes use `wp update`.
- `wp setup` repairs the managed `.gitignore` block for regenerated surfaces.
- Consumers use global `wp` + local `@webpresso/app-config`, never local `@webpresso/agent-kit`.
- `.agent/rules/` is authoritative policy: read the rule matching your task.
- Track instruction sources; ignore other generated/runtime surfaces (`.agents/`, `.codex/`, `.opencode/`).
- Keep the generated default `AGENTS.md` under 8 KB.

Codex routing instruction surface:
<wp_instruction_surface host="codex" artifact="AGENTS.md" source="wp_routing">
<host_contract>
<native_tool_families>blueprint, quality, pr-workflow, release, review, session-memory, tool-discovery, ui, worktree, ultragoal, worker. Call wp_tool_surface for exact tool names within a family.</native_tool_families>
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

For non-trivial changes, create the blueprint through the native MCP flow below before edits; use `wp blueprint start <slug>` only when MCP is unavailable. Never edit `main`. Non-`*.md` PRs need one unless `Blueprint-exempt: <reason>` or Dependabot-only.

Ultragoal: use `wp_ultragoal_new` and `wp_worktree`; CLI fallback is global `wp worktree new` / `wp worktree merge-cleanup`, never repo-local `./bin/wp`.

Catalog-owned surfaces:

- `.agent/commands/` — slash-command sources
- `.agent/skills/` — generated/projected skills; edit the catalog, not generated copies

## Implement

- Command routing is `wp`, then `vp`, then `pnpm`; use each only when the prior facade has no equivalent.
- Prefer repo scripts/wrappers over ad-hoc commands.
- Repo hook/tool denial: switch to the named facade/lifecycle; do not retry raw.
- Reuse nearby patterns; apply DRY, SOLID, YAGNI, and KISS.
- No hardcoded relative paths in executable code or config; derive from an explicit absolute anchor.
- Efficiency: MCP `wp_*` over shell; `/goal` + `autopilot`/`ultragoal`; `/verify`
  local vs `--merge-ready` (1 outside voice); `fix_budget`=1.
- For agent operations with an exact registered MCP route, MCP is required. CLI
  use is reserved for typed bootstrap, interactive, human-recovery, diagnostic,
  no-exact-parity, or parser-unrepresentable exception rows.

Hook invariant: global hooks use the canonical contract; skill hooks never enter
host settings. Bound hot paths; never raise timeouts or hide work asynchronously.

## Verify

Before completion, run narrow MCP/`wp` checks: typecheck, lint/format, affected tests, policy, docs/blueprint, and `wp sync --check` after catalog changes. Fix root causes or record blockers; before push, start `wp_ci_preflight` and poll `wp_ci_preflight_wait` until terminal success.

## Communicate

Explain rationale, tradeoffs, and verification. Before opening/updating a PR, prefill model disclosure, `Review artifact/verdict`, and session id (`wp session-info`), or add `Review-skip: SKIP <specific reason>` / `Session-skip: SKIP <reason>`; the PR description contract enforces this. Record durable decisions in the ADR/planning surface.

<!-- <<< managed by webpresso (operating-contract) -->

<!-- >>> user-owned (repo-customizations) -->

## Repo-specific customizations

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

**Published product is the Webpresso app** (desktop + CLI `wp`), not npm install of this monorepo root.
Canonical **source monorepo** GitHub repo: **`webpresso/app`**. Product binary tags live on **`webpresso/app-releases`** (release shell; app version axis `v0.0.x`). See `docs/OWNERSHIP_MAP.md`.

- This monorepo is the source/JIT harness surface (`WP_FORCE_JIT_PATH`) and builds `wp-*` binaries.
- Product ship: app-owned path (`app-release.yml` → `webpresso/app-releases`); launcher `$HOME/.webpresso/bin/wp`.
- Root package is **private** — not a public product npm package. Prefer `Changeset-exempt: app monorepo is source/JIT; published product is app (desktop+wp)` for harness-only PRs.
- Library packages (`@webpresso/app-config`, etc.) may still use Changesets if intentionally published; default **patch** only. Never invent product install via `npm install @webpresso/agent-kit`.

```bash
wp run changeset:status
```

Protocol: `.agent/rules/changeset-release.md`

## Package conventions

- No `../` parent-relative imports — use workspace deps + subpath exports.
- No `.mjs` source files — write `.ts`.
- Use `wp` > `vp` > `pnpm`; no `npm install`/`npx` setup guidance.
- All packages: `"type": "module"`.
- End-user product installs come from the **app** path (desktop + CLI `wp`); treat this monorepo as source/JIT, not `npm install` product.

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
