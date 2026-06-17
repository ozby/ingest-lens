<!--
  AGENTS.md template.

  Current-state agent-kit scaffolding (`wp setup`) renders this file with:
  - Repository map: bulleted list of workspace packages inferred from
    pnpm-workspace.yaml / package.json workspaces.
  - Tech stack: short description generated from package.json + detected
    frameworks (React, Hono, Drizzle, etc.).
  - Escalation map: user-edited section. Left as a TODO placeholder if
    not specified.
  - Durable planning root: defaults to `.agent/planning/`. Override via
    .webpressorc.json.
  - Blueprints directory: defaults to `blueprints`. Override via
    .webpressorc.json#blueprintsDir.

  Managed sections in this file are refreshed by agent-kit. Sync uses `wp sync`.
  Repo-specific edits belong only inside `user-owned` blocks; agent-kit preserves
  those blocks verbatim when it rewrites managed content.
-->

<!-- >>> managed by webpresso (operating-contract) -->
# Operating Contract

Prefer repo-local instructions when they are more specific than this template.
Keep changes small, reviewable, and verified.

## Setup after clone

```bash
vp install && vp run setup:agent  # setup:agent runs wp setup, which scaffolds .agent/, AGENTS.md, hooks, and runs wp sync
```

agent-kit's catalog is the single source of truth for generated agent surfaces.
Agent-kit owns the generated agent surfaces in this file; the Webpresso CLI host owns the end-user command surface.

Defaults worth preserving:
- `omx` refreshes via `vp upgrade`, then runs `omx setup --yes --scope user`.
- `omc` uses the Claude Code plugin marketplace path when `claude` is on `PATH`.
- `wp setup` repairs the managed `.gitignore` block for regenerated surfaces.
- Track repo-owned instruction sources (`AGENTS.md`, `agent-rules/`, `agent-skills/`).
- Ignore generated/runtime surfaces (`.agent/`, `.agents/`, `.omx/`, `.codex/`, `.claude/skills/`, etc.).

Current-state bootstrap commands remain `wp setup` / `wp sync`; future unified CLI replacements are `webpresso agent setup` / `webpresso agent sync`.

Prompt budget contract:
- Keep the generated default `AGENTS.md` under 8 KB.
- Move handbook prose to docs; keep only durable rules and command contracts here.

## Plan

Use blueprints for non-trivial work. Specs live in
[`blueprints/`](./blueprints/) with lifecycle directories such as
`planned/`, `in-progress/`, and `completed/`. Keep tasks, dependencies,
verification commands, and acceptance criteria current before execution.

Catalog-owned surfaces:
- `.agent/commands/` — slash-command sources
- `.agent/skills/` — generated/projected skills; edit the catalog, not generated copies

## Implement

- Prefer repo scripts/wrappers over ad-hoc commands.
- Reuse nearby utilities and patterns before adding new abstractions.
- Apply DRY, SOLID, YAGNI, and KISS.
- No hardcoded relative paths in executable code or config; derive from an explicit absolute anchor.

## Verify

Before claiming completion, run the narrowest checks that prove the change:
- agent-kit MCP tools first when available; otherwise the repo wrapper
- typecheck
- lint / format check
- affected tests
- repo policy checks such as `verify:paths` / `verify:secrets`
- docs or blueprint validation when docs/plans changed
- `wp sync --check` after template/catalog changes

If a gate fails, fix the root cause or record the blocker with evidence.

## Communicate

Explain why the change exists, what tradeoffs were made, and what was verified.
Record durable architecture decisions in the repo's ADR/planning surface if one exists.
<!-- <<< managed by webpresso (operating-contract) -->

<!-- >>> user-owned (repo-customizations) -->

## Repo-specific customizations

Add repo-local instructions, preferences, and exceptions here. Content inside
this block is preserved verbatim across `ak sync` runs.

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
- Do not create or persist secret-bearing files like `.env`, `.env.local`, `.env.*.local`, `.dev.vars`, or `.dev.vars.example`.
- Route secret-scoped commands through the repo contract (`wp config secrets` + `with-secrets -- <cmd>`).
- Keep secret/path checks on shared audit surfaces when available.
- Do not commit agent surfaces (`.agent/`, `.agents/`, `.gemini/`, `.cursor/`, `.windsurf/`, `.omx/`, `.omc/`, `.codex/`, `.opencode/`).
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

All webpresso public packages use **Changesets**. Never push `v*` tags or manually bump `package.json#version`.

Release flow:
1. `vp run changeset`
2. Commit the generated `.changeset/*.md`
3. Merge to `main` to update the **Version Packages** PR
4. Merge that PR to publish

```bash
vp run changeset:status
```

Full protocol: `.agent/rules/changeset-release.md`

## Package conventions

- No `../` parent-relative imports — use workspace deps + subpath exports.
- No `.mjs` source files — write `.ts`.
- Use `vp` as the command facade (`vp install`, `vp run <script>`).
- All packages: `"type": "module"`, public npm `publishConfig`.
- Auth: use npm trusted publishing/OIDC only; do not use `NPM_TOKEN` / `NODE_AUTH_TOKEN` publish fallbacks.

Full details: `.agent/rules/package-conventions.md`

## Repository map

- `@repo/e2e` — `apps/e2e`
- `@repo/infra` — `infra`
- `@repo/lab` — `apps/lab`
- `@repo/lab-core` — `packages/lab-core`
- `@repo/lab-s1a-correctness` — `apps/lab/scenarios/s1a-correctness`
- `@repo/lab-s1b-latency` — `apps/lab/scenarios/s1b-latency`
- `@repo/logger` — `packages/logger`
- `@repo/runtime-env-local` — `packages/runtime-env-local`
- `@repo/test-utils` — `packages/test-utils`
- `@repo/types` — `packages/types`
- `@repo/typescript-config` — `packages/config-typescript`
- `@repo/ui` — `packages/ui`
- `@repo/workers` — `apps/workers`
- `client` — `apps/client`

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
