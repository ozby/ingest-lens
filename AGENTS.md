<!-- >>> managed by webpresso (operating-contract) -->

# Operating Contract

Prefer repo-local instructions when more specific.
Keep changes small.

## Setup after clone

```bash
vp install && vp run setup:agent && wp sync  # setup and sync are separate, idempotent steps
```

agent-kit's catalog is the single source of truth for generated agent surfaces.
Agent-kit owns generated agent surfaces here; Webpresso CLI owns the end-user command surface.

- Optional agent tools can be WP-owned with `wp install codex|claude-code|opencode` or `wp install oh-my opencode`; `openagent` aliases the latter, and WP-owned scopes use `wp update`.
- `wp setup` repairs the managed `.gitignore` block for regenerated surfaces.
- Consumer repos use global `wp`, keep only `@webpresso/agent-config` locally, and do not add local `@webpresso/agent-kit`.
- Track repo-owned instruction sources (`AGENTS.md`, `agent-rules/`, `agent-skills/`); ignore generated/runtime surfaces (`.agent/`, `.agents/`, `.codex/`, `.opencode/`, etc.).

- Keep the generated default `AGENTS.md` under 8 KB.
- Move handbook prose to docs; keep only durable rules here.

Codex routing instruction surface:
<wp_instruction_surface host="codex" artifact="AGENTS.md" source="wp_routing">
<host_contract>
<native_tool_names>wp_audit, wp_audits, wp_bench, wp_ci_act, wp_e2e, wp_fleet_status, wp_format, wp_gain, wp_lint, wp_pr_status, wp_pr_upsert, wp_pr_wait, wp_qa, wp_release_readiness, wp_session_batch_execute, wp_session_capture, wp_session_context, wp_session_doctor, wp_session_execute, wp_session_execute_file, wp_session_fetch_and_index, wp_session_index, wp_session_purge, wp_session_retrieve, wp_session_restore, wp_session_search, wp_session_snapshot, wp_session_stats, wp_test, wp_typecheck, wp_ultragoal_cancel, wp_ultragoal_handoff, wp_ultragoal_new, wp_ultragoal_run, wp_ultragoal_status, wp_worker_tail, wp_worktree</native_tool_names>
<stdout_noop>Codex hook commands with no action write {} on stdout; durable guidance belongs in AGENTS.md.</stdout_noop>
<lifecycle_notes>
<note>Codex reads repository instruction files for durable guidance.</note>
<note>Unsupported managed lifecycle names are documented in the host capability matrix, not emulated here.</note>
</lifecycle_notes>
<public_support>Public support: first-class Codex instruction artifact.</public_support>
</host_contract>
</wp_instruction_surface>

## Plan

Use blueprints for non-trivial work. Specs live in
[`blueprints/`](./blueprints/) with lifecycle directories such as
`planned/`, `in-progress/`, and `completed/`. Keep tasks, dependencies,
verification commands, and acceptance criteria current before execution.

For non-trivial changes, run repo lifecycle tooling before edits. Single
blueprint: `./bin/wp blueprint start <slug>` creates/binds its owner worktree;
do not pre-create `wp worktree new bp/<slug>`. Never edit on `main`. PRs are
for review/landing. Non-`*.md` PRs need a changed blueprint unless
`Blueprint-exempt: <reason>` or Dependabot dependency-only. Full rule:
`.agent/rules/pre-implementation.md` § Blueprint gate.

Ultragoal: never use main as controller. Use `./bin/wp worktree new
bp/ultragoal-<slug> --base origin/main`; run `./bin/wp blueprint start
<slug>` there. After merge run `./bin/wp worktree merge-cleanup
<merged-worktree> --base origin/main` (or `--stash-primary` if primary is
dirty); do not claim done while the
merged worktree remains.

Catalog-owned surfaces:

- `.agent/commands/` — slash-command sources
- `.agent/skills/` — generated/projected skills; edit the catalog, not generated copies

## Implement

- Prefer repo scripts/wrappers over ad-hoc commands.
- Repo hook/tool denial: switch to the named facade/lifecycle; do not retry raw.
- Reuse nearby utilities and patterns before adding new abstractions.
- Apply DRY, SOLID, YAGNI, and KISS.
- No hardcoded relative paths in executable code or config; derive from an explicit absolute anchor.

Hook invariant: global hooks use the canonical contract; skill hooks never
project into host settings. Bound hot paths; do not raise timeouts or hide work
asynchronously.

## Verify

Before claiming completion, run the narrowest checks that prove the change:

- agent-kit MCP tools first when available; otherwise the repo wrapper
- typecheck
- lint / format check
- affected tests
- repo policy checks such as `verify:paths` / `verify:secrets`
- docs or blueprint validation when docs/plans changed
- `wp sync --check` after template/catalog changes

If a gate fails, fix root cause or record the blocker with evidence.

## Communicate

Explain why the change exists, tradeoffs, and what was verified.
Before opening/updating a PR, prefill `.github/PULL_REQUEST_TEMPLATE.md`
AI/model disclosure (`Execution model(s)`, `Planning/refinement model(s)`,
`Review/verification model(s)`, `Review artifact/verdict`, `Session id` via
`wp session-info`) or add `Review-skip: SKIP <specific reason>` /
`Session-skip: SKIP <reason>`; the PR description contract enforces this.
Record durable architecture decisions in the repo's ADR/planning surface if one exists.

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

- Materialized by setup: blueprint lifecycle directories under `blueprints/`.
- Put blueprint-owned PRDs and test specs under `blueprints/`, next to the blueprint they refine.
- Generated on demand (not created by setup): boundary contracts at `.agent/planning/contracts/`, lifecycle state at `.agent/planning/state/`, session notes at `.agent/planning/notepad.md`, and project memory at `.agent/planning/project-memory.json`.

If work changes workspace ownership, build boundaries, or cross-package consumption mode, update the relevant boundary contract before claiming the plan is ready.

## Releases

Packages use **Changesets**. Release-visible changes need `.changeset/*.md`; non-release needs `Changeset-exempt: <reason>`. Default patch. Never minor/major without explicit user request; ask if warranted. Never tag or bump versions.

Flow: changeset → commit → merge; Version PR uses `release.yml` only. Never local publish; `npm view` is registry evidence.

```bash
vp run changeset:status
```

Protocol: `.agent/rules/changeset-release.md`

## Package conventions

- No `../` parent-relative imports — use workspace deps + subpath exports.
- No `.mjs` source files — write `.ts`.
- Use `vp` as the command facade; no `npm install`/`npx` setup guidance.
- All packages: `"type": "module"`, public npm `publishConfig`.
- Publishing: `release.yml`/OIDC only; no local publish or token fallbacks.

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
- `@repo/ui` — `packages/ui`
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

- Client UI (`apps/client`, `packages/ui`) — frontend lane owner / UI maintainer
- Workers API (`apps/workers`) — backend lane owner / Workers maintainer
- Infra + deploy (`infra`, Wrangler, Pulumi, configured secret provider) — infrastructure operator
- E2E + Neon branch tooling (`apps/e2e`) — QA / release lane owner
- Agent/runtime surfaces (`.agent`, audits, blueprints, CI guardrails) — repo operator

<!-- <<< user-owned (escalation-map) -->
