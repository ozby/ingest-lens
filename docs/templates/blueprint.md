---
type: blueprint
status: draft
complexity: M
created: "2026-04-21"
last_updated: "2026-04-21"
progress: "0% (drafted)"
depends_on: []
tags: []
---

# {{title}}

**Goal:** {{description}}

## Planning Summary

- Goal input: `{{description}}`
- Complexity: `{{complexity}}`
- Draft slug: `{{slug}}`
- Output path: `blueprints/{{status}}/{{slug}}/_overview.md`
- Validation scope: structure, exact file paths, and repo command realism before write

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

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates, **not** day/week estimates.

**Lifecycle:** Blueprint frontmatter `status` is one of `draft`, `planned`, `parked`, `in-progress`, `completed`, `archived`. There is no blueprint-level `blocked` status; when work waits on a dependency, set the task **Status:** to `blocked` and add a non-empty **Blocked:** line with the reason.

> [!NOTE]
> This template mirrors the Webpresso blueprint structure and task conventions, but verification commands are adapted to this repo’s `pnpm` + `turbo` command authority.

### Phase 1: [Phase Name] [Complexity: S]

#### [lane] Task 1.1: [Component Name]

**Status:** todo

**Depends:** None

[Self-contained description. An independent agent should be able to execute
this task with only this text + the codebase + repo commands. Never rely on
“see above” references for execution-critical context.]

**Files:**

- Create: `exact/path/to/file.ts`
- Create: `exact/path/to/file.test.ts`
- Modify: `exact/path/to/existing.ts`

**Steps (TDD):**

1. Write a failing test for [specific behavior]
2. Run: `pnpm --filter <workspace> test` — verify FAIL
3. Implement the minimal change to pass
4. Run: `pnpm --filter <workspace> test` — verify PASS
5. Refactor if needed (complexity <= 8)
6. Run: `pnpm --filter <workspace> lint` and `pnpm --filter <workspace> check-types`

**Acceptance:**

- [ ] Test file created with a failing test first
- [ ] Implementation passes all targeted tests
- [ ] `pnpm --filter <workspace> lint` passes
- [ ] `pnpm --filter <workspace> check-types` passes

---

## Verification Gates

| Gate        | Command                              | Success Criteria     |
| ----------- | ------------------------------------ | -------------------- |
| Type safety | `pnpm check-types`                   | Zero errors          |
| Lint        | `pnpm lint`                          | Zero violations      |
| Tests       | `pnpm test`                          | Relevant suites pass |
| Docs format | `pnpm exec prettier --check <paths>` | All pass             |

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
