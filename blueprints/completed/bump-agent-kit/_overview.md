---
type: blueprint
status: completed
complexity: XS
created: "2026-04-25"
last_updated: "2026-04-25"
progress: "100% — merged to main on 2026-04-25"
depends_on: []
tags:
  - agent-kit
  - tooling
  - webpresso
  - tech-debt
  - lore
---

# Bump `@webpresso/agent-kit` — enable tech-debt, Lore validation, slim symlinker

**Goal:** Update the `@webpresso/agent-kit` SHA pin from `e869a33` (old) to
`d3922c5` (latest, 2026-04-25). This unlocks:

- `ak tech-debt` lifecycle commands for formal debt tracking
- `ak audit commit-message-lore` — CI-enforced Lore Commit Protocol validation
- Slim symlinker (Codex/Amp/Gemini only; Claude Code + Cursor/Windsurf use
  local skills distribution instead)
- `base-kit` preset in `ak setup` (pnpm catalog, husky, CI templates)
- Claude Code plugin packaging for proper skill surface discovery

## Planning Summary

- **Why now:** 12 commits have landed since the current pin, including features
  directly useful to ingest-lens: Lore commit validation in CI, `ak tech-debt`
  for the growing list of TODOs left in the codebase (JWT jti revocation,
  DNS-egress SSRF protection, etc.), and an improved symlinker that correctly
  handles the Claude Code plugin distribution model.
- **Scope:**
  1. Update SHA in `package.json` devDependencies.
  2. `pnpm install --frozen-lockfile=false` to fetch new version.
  3. `ak symlink sync` to re-sync `.agent/` → per-IDE surfaces (slim symlinker
     may produce a diff on `.gemini/`, `.cursor/`, etc.)
  4. Add `ak audit commit-message-lore` step to `.github/workflows/ci.yml`.
  5. Run `ak tech-debt list` — capture any pre-existing tech-debt entries; create
     formal entries for the known open TODOs (`// TODO: implement jti blocklist`,
     DNS-egress SSRF, etc.).
- **Primary success metric:** `pnpm blueprints:check` passes, `ak audit
commit-message-lore` passes on the existing commit history, and at least the
  JWT revocation TODO is registered as a formal `ak tech-debt` entry.

## Architecture Overview

```text
package.json
  "@webpresso/agent-kit": "github:webpresso/agent-kit#e869a33" (before)
  "@webpresso/agent-kit": "github:webpresso/agent-kit#d3922c5" (after)

.agent/ (canonical source — unchanged)
  ↓  ak symlink sync  (slim symlinker — only Codex/Amp/Gemini get symlinked)
.gemini/commands/  ← re-synced
.codex/           ← re-synced (if present)
Claude Code uses localskills distribution (separate from symlinker)

CI pipeline (ci.yml) adds step:
  - name: Validate Lore commits
    run: pnpm exec ak audit commit-message-lore --since origin/main
```

## Key Decisions

1. **Freeze the SHA, not a semver range** — `@webpresso/agent-kit` is a Git
   dependency. Pinning to a SHA is intentional and remains the right approach.
   Update the SHA, don't switch to a branch or tag pointer.

2. **Slim symlinker changes** — The new symlinker no longer manages Claude Code
   or Cursor/Windsurf surfaces (those use local skills distribution). Running
   `ak symlink sync` may remove previously generated files from those IDEs.
   This is correct — accept the diff.

3. **`ak audit commit-message-lore --since origin/main`** — Run only on branch
   commits (not full history) in CI. The pre-commit hook already enforces Lore
   format on new commits; CI is a belt-and-suspenders check for squash-merged
   PRs and force-pushes.

4. **Tech-debt entries** — Known open TODOs to register:
   - JWT jti revocation blocklist (`apps/workers/src/auth/crypto.ts`)
   - DNS-egress SSRF via CNAME (`apps/workers/src/lib/validate-push-endpoint.ts`)
   - CF Analytics Engine integration for `CostEstimatorCron` (`apps/lab/src/crons/cost-estimator.ts`)
   - `prd` Pulumi stack (`infra/` — placeholder IDs)
   - Font files download for lab UI (`apps/lab/assets/LICENSES/fonts.txt`)

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable | Effort |
| ----------------- | --------------- | ------------ | -------------- | ------ |
| **Wave 0**        | 3.1             | None         | 1 agent        | XS     |
| **Wave 1**        | 3.2, 3.3        | 3.1          | 2 agents       | XS     |
| **Wave 2**        | 3.4             | 3.2, 3.3     | 1 agent        | XS     |
| **Critical path** | 3.1 → 3.2 → 3.4 | 3 waves      | —              | XS     |

**Worktree:** `.worktrees/bump-agent-kit/` on branch `pll/bump-agent-kit`.

### Phase 1: Pin update + re-sync [Complexity: XS]

#### [infra] Task 3.1: Update SHA in `package.json`

**Status:** pending

**Depends:** None

In `package.json` devDependencies, change:

```
"@webpresso/agent-kit": "github:webpresso/agent-kit#e869a333dde35a8a47c179b51e21e8d2079cf3b5"
```

to:

```
"@webpresso/agent-kit": "github:webpresso/agent-kit#d3922c52419b5af57fdb68d3b9aa8b8c2db083ba"
```

Then run `pnpm install --frozen-lockfile=false` to update `pnpm-lock.yaml`.

Verify `ak --version` reports a different (newer) version and that `ak blueprint audit --all` still passes.

**Files:**

- Edit: `package.json`
- Auto-updated: `pnpm-lock.yaml`

**Acceptance:**

- [ ] `pnpm blueprints:check` passes
- [ ] `pnpm docs:check` passes
- [ ] `ak --version` changes from previous

---

#### [tooling] Task 3.2: Run `ak symlink sync`

**Status:** pending

**Depends:** 3.1

```bash
pnpm exec ak symlink sync
```

Review the diff. The slim symlinker may remove files previously generated for
Claude Code or Cursor/Windsurf surfaces — accept these removals. Commit the
changed `.agent/` surface outputs.

**Files:**

- Potentially edited: `.gemini/commands/*`, `.cursor/commands/*`, `.windsurf/commands/*`

**Acceptance:**

- [ ] `ak symlink sync` exits 0
- [ ] No manually maintained files accidentally removed

---

#### [tooling] Task 3.3: Register tech-debt entries

**Status:** pending

**Depends:** 3.1

Run `ak tech-debt list` to check for existing entries. Then register the 5 known
open TODOs using `ak tech-debt add`:

```bash
pnpm exec ak tech-debt add \
  --title "JWT jti revocation blocklist" \
  --file "apps/workers/src/auth/crypto.ts" \
  --severity medium \
  --note "TODO comment in code; TTL reduction is the current mitigation"

pnpm exec ak tech-debt add \
  --title "DNS-rebinding SSRF via CNAME → private IP" \
  --file "apps/workers/src/lib/validate-push-endpoint.ts" \
  --severity medium \
  --note "Requires CF egress firewall rule; documented in code"

pnpm exec ak tech-debt add \
  --title "CF Analytics Engine integration for CostEstimatorCron" \
  --file "apps/lab/src/crons/cost-estimator.ts" \
  --severity low \
  --note "Returns 0 as safe fallback until CF dataset is provisioned"

pnpm exec ak tech-debt add \
  --title "prd Pulumi stack — placeholder IDs in wrangler.toml" \
  --file "apps/workers/wrangler.toml" \
  --severity low \
  --note "Hyperdrive, KV, R2 use placeholder IDs; infra/src/deploy needs prd stack"

pnpm exec ak tech-debt add \
  --title "Lab UI fonts not committed — fontsource download blocked" \
  --file "apps/lab/assets/LICENSES/fonts.txt" \
  --severity low \
  --note "Font woff2 files must be downloaded before deploy; see fonts.txt"
```

Adjust the CLI syntax to match whatever `ak tech-debt add` actually accepts
(read `ak tech-debt --help` first).

**Files:**

- Auto-created: `tech-debt/` entries (wherever `ak tech-debt` stores them)

**Acceptance:**

- [ ] `ak tech-debt list` shows all 5 entries
- [ ] Entries are committed

---

#### [ci] Task 3.4: Add `ak audit commit-message-lore` to CI

**Status:** pending

**Depends:** 3.2, 3.3

Add a step to `.github/workflows/ci.yml` after the existing `blueprints:check`
step:

```yaml
- name: Validate Lore commits
  run: pnpm exec ak audit commit-message-lore --since origin/${{ github.base_ref || 'main' }}
```

This runs on PRs (validates branch commits) and on push to main (validates
the merge commit).

**Files:**

- Edit: `.github/workflows/ci.yml`

**Acceptance:**

- [ ] CI workflow syntax valid (`act --list` or similar)
- [ ] `ak audit commit-message-lore --since origin/main` exits 0 on current history

## Verification Gates

```bash
ak --version                                              # changed
pnpm blueprints:check                                     # OK
pnpm docs:check                                           # OK
pnpm exec ak audit commit-message-lore --since origin/main  # 0 violations
ak tech-debt list                                         # 5 entries
```

## Cross-Plan References

| Type    | Blueprint                | Relationship                     |
| ------- | ------------------------ | -------------------------------- |
| Sibling | `adopt-workers-test-kit` | Independent; can run in parallel |
| Sibling | `adopt-db-branching`     | Independent; can run in parallel |

## Non-goals

- Migrating to `ak setup base-kit` (would overwrite existing workspace config)
- Changing the Lore Commit Protocol itself — existing format is correct
- Running `ak tech-debt` audit in CI (list only; enforcement is future work)

## Risks

| Risk                                                                 | Mitigation                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| New `ak` version has breaking changes to `blueprint-lifecycle` audit | Run `pnpm blueprints:check` immediately after install; revert SHA if it fails |
| Slim symlinker removes files that were hand-maintained               | Review diff carefully in 3.2; only accept auto-generated removals             |
| `ak audit commit-message-lore` fails on old commits                  | Use `--since origin/main` to scope to branch-only; not a full-history scan    |
