---
type: blueprint
owner: webpresso
title: "Immutable agent-kit setup migration"
status: in-progress
complexity: M
created: "2026-07-11"
last_updated: "2026-07-11"
progress_pct: 10
progress: "Worktree created; setup-owned migration and verification pending."
depends_on:
  - "webpresso/agent-kit#509 at e7f4cd01566ff6473fc2aa1a4ca3b1f800216a12"
---

# Immutable agent-kit setup migration

## Status

In progress — migrate every consumer workflow from mutable, duplicated agent-kit installs to the setup-owned immutable `setup-wp` action contract.

## Architecture references

- [Architecture](../../docs/architecture.md)
- [Machine-checkable architecture contract](../../docs/architecture.contract.json)

## Problem

CI jobs install a duplicated `@webpresso/agent-kit@2.3.2` pin directly. Every agent-kit release therefore requires consumer edits, while workflow coverage only checks a narrow expected install snippet and can miss legacy pins in newly added workflow files.

## Scope

- Run `wp setup` and `wp sync` from the agent-kit owner checkpoint for PR #509.
- Accept setup-owned migrations for workflows, hooks, local dependencies, harness manifests, and generated contracts.
- Add a repo-owned regression contract only if setup does not generate equivalent all-workflow coverage.
- Verify setup idempotency and the exact 3.1.10 audit surface.
- Verify typecheck, lint, tests, and workflow policy checks.

## Non-goals

- Do not hand-maintain generated setup behavior.
- Do not merge the draft PR.
- Do not alter application runtime behavior.

## Tasks

#### [migration] Task 1.1: Run owner-checkpoint setup

**Status:** in progress

**Depends:** None

- Locate the agent-kit PR #509 owner worktree at the required checkpoint.
- Run its exact `wp setup` and `wp sync` migration entrypoints.
- Review the resulting setup-owned diff for completeness.

#### [contract] Task 1.2: Harden workflow discovery

**Status:** pending

**Depends:** Task 1.1

- Confirm whether setup generates an all-workflow contract.
- If absent, make the repo-owned test discover every workflow YAML file and reject legacy/direct agent-kit installs and mutable pins.

#### [qa] Task 1.3: Verify and publish draft PR

**Status:** pending

**Depends:** Task 1.1, Task 1.2

- Run setup twice and prove the second pass is clean.
- Run exact 3.1.10 audits plus repo typecheck, lint, and tests.
- Commit, push, and keep the PR in draft state.

## Acceptance criteria

- Every workflow uses the immutable setup-owned `setup-wp` action contract with no direct agent-kit install or legacy version pin.
- Adding a future workflow with a legacy/direct pin fails the repo contract test.
- Setup and sync are idempotent at the owner checkpoint.
- Exact agent-kit 3.1.10 audits and affected repo gates pass, or a precise upstream setup gap is reported.
- A draft PR is open; no merge is performed.

## Verification evidence

Pending.
