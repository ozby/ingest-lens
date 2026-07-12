---
type: blueprint
status: completed
completed_at: "2026-07-12"
title: "Harden consumer secret authority contract"
owner: ozby
worktree_owner_id: owner-ca92350439a9
worktree_owner_branch: bp/harden-consumer-secret-authority-contract
complexity: S
created: "2026-07-12"
last_updated: "2026-07-12"
progress: "100% (complete)"
depends_on: []
cross_repo_depends_on:
  - repo: webpresso/agent-kit
    slug: 2026-07-12-consumer-runtime-and-audit-reliability
tags:
  - secrets
  - consumer
approvals:
  - reviewer: codex
    verdict: approve
    evidence: reviews.md
    artifact: review-artifacts/codex-final.md
    rev: final
---

# Harden consumer secret authority contract

**Goal:** Make ingest-lens's committed schema-v1 Doppler provider and preview/production profiles executable and regression-protected independently of stale machine-local state.

## Product wedge anchor

- **Stage outcome:** ingest-lens launches agents and commands with its committed Doppler project instead of stale machine state.
- **Consuming surface:** The global `wp` setup, secrets doctor, and secrets run surfaces in ingest-lens.
- **New user-visible capability:** A fresh or stale-config host resolves ingest-lens preview and production profiles deterministically.

## Architecture Overview

```text
.webpresso/secrets.config.json -> global wp profile resolution -> Doppler -> requested command
```

The runtime owner is agent-kit. This consumer owns only metadata, exact contract tests,
and repository-specific operator wording.

## Key Decisions

| Decision         | Choice                                                            | Rationale                                                              |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Secret authority | Keep committed schema-v1 provider/profile metadata authoritative  | Prevent stale global `ozby-shell` state from overriding the repository |
| Regression shape | Assert exact project and profile environments at repository level | Detect accidental cross-consumer copy/paste                            |
| Runtime proof    | Inject preview secrets into `true` without printing values        | Proves provider access without exposing secrets                        |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| ---- | ----- | ------------ | -------------- |
| 1    | 1.1   | None         | No             |
| 2    | 1.2   | 1.1          | No             |

### Phase 1: Consumer contract [Complexity: S]

#### [qa] Task 1.1: Lock exact committed secret metadata

**Status:** done

**Depends:** None

Add a repository-level Vitest assertion for schema version 1, Doppler project
`ozby-dev`, workspace `ozby`, preview `stg`, and production `prd`.

**Files:**

- Modify or create: `test/secrets-config-contract.test.ts`
- Modify or create: `blueprints/archived/client-workers-assets-deploy/_overview.md`

**Steps (TDD):**

1. Add the exact contract assertion.
2. Confirm it detects a temporary `ozby-shell` mutation.
3. Restore the committed `ozby-dev` value and verify the test passes.
4. Correct the stale archived operational project reference while preserving context.

**Acceptance:**

- [x] Exact project and profile environments are regression-protected.
- [x] No active consumer source points operators to `ozby-shell`.
- [x] No secret value is read or printed.

**Verification:**

```webpresso-evidence-v1
[{"command":"vp test test/secrets-config-contract.test.ts && vp run verify:secrets-config","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-12T04:00:00Z"}]
```

#### [qa] Task 1.2: Verify real consumer execution

**Status:** done

**Depends:** Task 1.1

Run the scoped test, lint, typecheck, secret audits, and a no-output preview
injection through the global `wp` facade.

**Acceptance:**

- [x] `wp secrets doctor --profile preview --json` passes.
- [x] `wp secrets run --sink dev-server --profile preview -- true` passes.
- [x] Repository tests, lint, typecheck, and applicable blueprint audits pass.

**Verification:**

```webpresso-evidence-v1
[{"command":"wp secrets doctor --profile preview --json && wp secrets run --sink dev-server --profile preview -- true && wp lint && wp typecheck && wp audit test-smells && wp audit agents && wp audit blueprint-trust && wp audit blueprint-lifecycle --staged --strict && wp sync --check","exit_code":0,"kind":"integration","result":"pass","target_files":[".webpresso/secrets.config.json","package.json","test/secrets-config-contract.test.ts"],"ts":"2026-07-12T04:00:00Z"}]
```

## Verification Gates

| Gate         | Command                                                      | Success Criteria       |
| ------------ | ------------------------------------------------------------ | ---------------------- |
| Contract     | `wp test --file test/secrets-config-contract.test.ts`        | Pass                   |
| Doctor       | `wp secrets doctor --profile preview --json`                 | `WP_SECRETS_DOCTOR_OK` |
| Injection    | `wp secrets run --sink dev-server --profile preview -- true` | Exit 0, no output      |
| Test quality | `wp audit test-smells`                                       | Pass                   |
| Lifecycle    | `wp audit blueprint-lifecycle --staged --strict`             | Pass                   |

## Edge Cases and Error Handling

| Edge Case                   | Risk                         | Solution                                     | Task |
| --------------------------- | ---------------------------- | -------------------------------------------- | ---- |
| Stale local provider state  | Wrong Doppler project/config | Committed metadata wins; exact contract test | 1.1  |
| Secret leakage during proof | Credentials reach logs       | Execute `true`; never print environment      | 1.2  |

## Non-goals

- Creating new Doppler projects or configs.
- Downloading, persisting, or displaying secret values.
- Changing shared agent-kit runtime behavior.

## Risks

| Risk                             | Impact             | Mitigation                                                          |
| -------------------------------- | ------------------ | ------------------------------------------------------------------- |
| Historical documentation rewrite | Loss of provenance | Change only stale operational claims, preserving historical context |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-12T03:25:45.796Z
- verified-head: a8e1b1d995b90853c36e6e080049a38215072ba5
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                           | Evidence                            |
| --- | --------------------------------------------------------------- | ----------------------------------- |
| C1  | ingest-lens commits schema-v1 Doppler metadata for `ozby-dev`.  | repo:.webpresso/secrets.config.json |
| C2  | This consumer exposes the global `wp setup` bootstrap contract. | repo:package.json                   |

### Material Decisions

| ID  | Decision       | Chosen option                                     | Rejected alternatives              | Rationale                                        |
| --- | -------------- | ------------------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| D1  | Consumer proof | Exact metadata test plus no-output live injection | Rely on runtime tests alone        | Covers copy/paste drift and real provider access |
| D2  | Scope          | Consumer test and stale guidance only             | Duplicate runtime resolver locally | Keeps ownership in agent-kit                     |

### Promotion Gates

| Gate      | Command      | Expected outcome | Last result                      |
| --------- | ------------ | ---------------- | -------------------------------- |
| Lint      | wp lint      | pass             | pass at 2026-07-12T03:25:45.796Z |
| Typecheck | wp typecheck | pass             | pass at 2026-07-12T03:25:45.796Z |

### Residual Unknowns

None.
