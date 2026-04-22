---
type: blueprint
status: draft
complexity: M
created: '2026-04-22'
last_updated: '2026-04-22'
progress: '0% (drafted)'
depends_on: []
tags: []
---

# {{title}}

**Goal:** {{description}}

## Planning Summary

- Goal input: `{{description}}`
- Complexity: `{{complexity}}`
- Draft slug: `{{slug}}`
- Output path: `{{output_path}}`
- Generated command: `ak blueprint new "{{description}}" --complexity {{complexity}}`
- Validation scope: parser compliance before write

## Architecture Overview

```text
[Diagram showing how components connect before/after]
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
|          |        |           |

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable |
| ----------------- | ----- | ------------ | -------------- |
| **Wave 0**        | 1.1   | None         | 1 agent        |
| **Critical path** | 1.1   | --           | 1 wave         |

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates, NOT day/week estimates.

**Lifecycle:** Blueprint frontmatter `status` is one of `draft`, `planned`, `parked`, `in-progress`, `completed`, `archived`. Use `parked` when the blueprint is intentionally paused but should remain distinct from active planning or abandoned work. There is no blueprint-level `blocked` status; when work waits on an external dependency, set the task **Status:** to `blocked` and add a non-empty **Blocked:** line with the reason.

> [!NOTE]
> This template reflects the current preferred blueprint structure. Repo-wide validity is determined by the live blueprint parser/audit rules, so older blueprints may still use a different-but-valid section mix.

### Phase 1: [Phase Name] [Complexity: S]

#### Task 1.1: [Component Name]

> **Task header (current accepted form):** Use `#### [lane] Task X.Y:` when the task has a clear lane (`[schema]`, `[backend]`, `[ui]`, `[infra]`, `[docs]`, `[qa]`). `#### Task X.Y:` is still valid, but lane-prefixed headers are preferred in new blueprints.

**Status:** todo

**Depends:** None

[Self-contained description. An independent agent must be able to execute
this task with ONLY this text + the codebase + repo-owned commands. Never
reference "see above" or "as described in Task X.Y" — inline all context.]

**Files:**

- Create: `exact/path/to/file.ts`
- Create: `exact/path/to/file.test.ts`
- Modify: `exact/path/to/existing.ts`

**Steps (TDD):**

1. Write failing test for [specific behavior]
2. Run the repo's scoped test recipe — verify FAIL
3. Implement minimal code to pass
4. Run the repo's scoped test recipe — verify PASS
5. Refactor if needed (complexity <= 8)

**Acceptance:**

- [ ] Test file created with failing test
- [ ] Implementation passes all tests
- [ ] Scoped lint passes
- [ ] Verification commands recorded in the task notes

#### Task 1.2: [Component Name]

**Status:** todo

**Depends:** Task 1.1

[Self-contained description.]

**Files:**

- Create: `exact/path/to/file.ts`

**Steps (TDD):**

1. Write failing test
2. Run the repo's scoped test recipe — verify FAIL
3. Implement
4. Run the repo's scoped test recipe — verify PASS

**Acceptance:**

- [ ] Tests pass
- [ ] Lint passes

---

## Verification Gates

| Gate        | Command                            | Success Criteria |
| ----------- | ---------------------------------- | ---------------- |
| Type safety | repo typecheck recipe              | Zero errors      |
| Lint        | repo lint recipe (scoped)          | Zero violations  |
| Tests       | repo test recipe (scoped)          | All pass         |
| Full QA     | repo full-QA recipe                | All pass         |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | None      |              |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
|           |      |          |      |

## Non-goals

- [What this blueprint does NOT cover]

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
|      |        |            |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
|           |            |         |     |
