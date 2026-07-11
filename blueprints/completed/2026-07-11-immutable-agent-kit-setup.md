---
type: blueprint
owner: webpresso
title: "Immutable agent-kit setup migration"
status: completed
complexity: M
created: "2026-07-11"
last_updated: "2026-07-11"
progress_pct: 100
progress: "Completed: setup owns the immutable Vite+/agent-kit bootstrap, workflow policy is self-enforcing, and local plus clean-Linux verification passes."
completed_at: "2026-07-11"
depends_on:
  - "webpresso/agent-kit#509 from e7f4cd01566ff6473fc2aa1a4ca3b1f800216a12 through the rebased setup migration at f7cbc2677e16fa7b56ac3b1abf903598498cf1f0"
---

# Immutable agent-kit setup migration

## Status

Completed — every consumer workflow now uses setup-owned immutable Vite+ and agent-kit actions, backed by all-workflow regression coverage.

## Architecture references

- [Architecture](../../docs/architecture.md)
- [Machine-checkable architecture contract](../../docs/architecture.contract.json)

## Problem

CI jobs install a duplicated `@webpresso/agent-kit@2.3.2` pin directly. Every agent-kit release therefore requires consumer edits, while workflow coverage only checks a narrow expected install snippet and can miss legacy pins in newly added workflow files.

## Scope

- Run `wp setup` and `wp sync` from the agent-kit owner checkpoint for PR #509.
- Accept setup-owned migrations for workflows, hooks, local dependencies, harness manifests, and generated contracts.
- Add a repo-owned regression contract only if setup does not generate equivalent all-workflow coverage.
- Verify setup idempotency, the current 3.1.11 audit surface, and 3.1.10 compatibility where relevant.
- Verify typecheck, lint, tests, and workflow policy checks.

## Non-goals

- Do not hand-maintain generated setup behavior.
- Do not merge the draft PR.
- Do not alter application runtime behavior.

## Tasks

#### [migration] Task 1.1: Run owner-checkpoint setup

**Status:** done

**Depends:** None

- Locate the agent-kit PR #509 owner worktree at the required checkpoint.
- Run its exact `wp setup` and `wp sync` migration entrypoints.
- Review the resulting setup-owned diff for completeness.

#### [contract] Task 1.2: Harden workflow discovery

**Status:** done

**Depends:** Task 1.1

- Confirm whether setup generates an all-workflow contract.
- If absent, make the repo-owned test discover every workflow YAML file and reject legacy/direct agent-kit installs and mutable pins.

#### [qa] Task 1.3: Verify and publish draft PR

**Status:** done

**Depends:** Task 1.1, Task 1.2

- Run setup twice and prove the second pass is clean.
- Run exact 3.1.11 audits, relevant 3.1.10 compatibility checks, plus repo typecheck, lint, and tests.
- Commit, push, and keep the PR in draft state.

## Acceptance criteria

- Every workflow uses the immutable setup-owned `setup-wp` action contract with no direct agent-kit install or legacy version pin.
- Adding a future workflow with a legacy/direct pin fails the repo contract test.
- Setup and sync are idempotent at the owner checkpoint.
- Exact agent-kit 3.1.11 audits, relevant 3.1.10 compatibility checks, and affected repo gates pass, or a precise upstream setup gap is reported.
- A draft PR is open; no merge is performed.

## Verification evidence

- Setup source at `f7cbc2677e16fa7b56ac3b1abf903598498cf1f0` produced six immutable `setup-wp` calls and the official full-SHA `setup-vp` bootstrap; repeated setup output converged byte-for-byte.
- `node scripts/check-workflow-action-pins.ts` and `node --test test/ci-workflow-contract.test.ts` pass while scanning every workflow YAML file.
- Agent-kit 3.1.11 audits passed for catalog drift, blueprint lifecycle, secret-provider quarantine, no-dev-vars, absolute paths, and Cloudflare deploy contracts; 3.1.10 lifecycle and quarantine compatibility checks also pass.
- Repo formatting/lint, typecheck, tests, and changed-workflow `actionlint` checks passed before publication.
- A clean Linux 3.1.11 reproduction identified and resolved the final CI-only local worktree-binding issue by completing this blueprint.
