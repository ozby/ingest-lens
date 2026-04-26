---
name: plan-refine
description: Methodology for refining, fact-checking, and hardening implementation blueprints. Enforces Blueprint format for maximum parallel execution via /pll, verifies technology claims, aligns cross-plan dependencies, and hardens architecture against edge cases.
status: production-ready
---

> **Implementation Status: Production-Ready**
>
> Blueprint hardening and lifecycle infrastructure are production-ready:
>
> - Kahn's Algorithm DAG analysis (fully tested)
> - `ParallelExecutor` concurrency engine with abort, timeout, per-type limits
> - Blueprint dependency format and validation
> - Failed tasks block dependents automatically
>
> **Remaining gaps:** execution docs and wrappers must stay aligned with the currently shipped runtime and CLI surface.

# Plan Refinement Methodology

## Core Principle

> **"A plan is only as strong as its weakest unchecked assumption — and only as fast as its coarsest task granularity."**

Every technology claim, file path, API assumption, and architecture decision in a blueprint must be verified against reality before implementation begins. Unverified plans create cascading failures during execution. Poorly structured plans serialize work that could run in parallel — wasting 10x the wall-clock time.

Refinement has two equally important goals:

1. **Correctness** — Every claim is fact-checked, every edge case documented
2. **Parallelizability** — Tasks are structured in Blueprint format with maximum independence for `/pll`

## When to Use

**ALWAYS refine a plan when:**

- A new blueprint has been created from Q&A or brainstorming
- A blueprint references specific technologies, libraries, or APIs
- A blueprint makes assumptions about existing codebase structure
- A blueprint has cross-plan dependencies (upstream/downstream)
- Before moving a blueprint from `draft/` to `in-progress/`
- After significant codebase changes that may invalidate assumptions
- Tasks are too coarse for parallel execution (should be split)

**Don't use for:**

- Trivial single-task plans (just verify inline)
- Plans that are purely process/methodology (no code assumptions)
- Plans already verified and in execution

## The Refinement Pipeline

```
Blueprint (Draft/In-Progress)
        │
        ▼
┌─────────────────────────────────┐
│  PHASE 1: Technology Fact-Check │  ← Web research + docs
│  - Library compatibility        │
│  - API correctness              │
│  - Version constraints          │
│  - Runtime compatibility        │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  PHASE 2: Codebase Verification │  ← Grep/Read existing code
│  - File paths exist             │
│  - APIs match signatures        │
│  - Patterns match conventions   │
│  - Dependencies available       │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  PHASE 3: Architecture Review   │  ← Adversarial critique
│  - Race conditions              │
│  - Echo loops                   │
│  - Error cascades               │
│  - Concurrent access            │
│  - Auth/session edge cases      │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  PHASE 4: Cross-Plan Alignment  │  ← Read dependent blueprints
│  - Upstream deps still valid    │
│  - Downstream plans updated     │
│  - No contradictions            │
│  - Shared decisions consistent  │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  PHASE 5: Blueprint Enforcement  │  ← Structure for parallelism
│  - Task granularity audit       │
│  - Dependency graph validation  │
│  - File conflict detection      │
│  - Wave optimization            │
│  - TDD steps in every task      │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  PHASE 6: Apply & Consolidate   │  ← Edit blueprint
│  - Apply all fixes (Fx tags)    │
│  - Update Edge Cases table      │
│  - Update Risks table           │
│  - Update Technology Choices    │
│  - Update cross-plan references │
│  - Rewrite tasks in Blueprint fmt│
└─────────────────────────────────┘
```

---

## Phase 1: Technology Fact-Check

**Goal:** Verify every technology claim against official documentation and known issues.

### What to Check

| Category                       | Check                                       | How                                                   |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------- |
| **Library compatibility**      | Does library X work with runtime Y?         | Web search `"library-name" + "runtime-name" + issues` |
| **API correctness**            | Does the API exist as described?            | Read official docs via Context7 or WebFetch           |
| **Version constraints**        | Is the version available? Breaking changes? | npm registry, changelogs                              |
| **Native addon compatibility** | Does it compile for all targets?            | Check Bun/Node/Deno compatibility                     |
| **Protocol correctness**       | Is the wire protocol right?                 | Official docs (e.g., WebSocket subprotocols)          |
| **Platform limits**            | Are there timeout/memory/size limits?       | Platform docs (e.g., Workers limits)                  |

### Output Format

For each finding, assign:

- **ID**: F1, F2, F3...
- **Severity**: CRITICAL (blocks implementation), HIGH (causes bugs), MEDIUM (suboptimal), LOW (cosmetic)
- **Claim**: What the blueprint says
- **Reality**: What documentation/research shows
- **Fix**: Concrete change to the blueprint

### Anti-Patterns

| Anti-Pattern                          | Why It's Wrong                    | Do This Instead                           |
| ------------------------------------- | --------------------------------- | ----------------------------------------- |
| "Library X should work"               | Untested assumption               | Verify with official docs + GitHub issues |
| Trusting AI knowledge of library APIs | Models hallucinate API signatures | Read actual docs via Context7/WebFetch    |
| Assuming latest version compatibility | Breaking changes happen           | Check specific version compatibility      |
| Ignoring native addon constraints     | Build failures in CI/CD           | Test against all target runtimes          |

## Phase 2: Codebase Verification

**Goal:** Verify every file path, import, API reference, and pattern assumption against the actual codebase.

Use the lightest reliable inspection tool first: prefer `rg -n` for search, `sed -n` for exact line ranges, and only escalate to ad hoc scripts when the extraction genuinely needs structure across many files.

### What to Check

| Category               | Check                                      | How                                     |
| ---------------------- | ------------------------------------------ | --------------------------------------- |
| **File paths**         | Do referenced files exist at stated paths? | `Glob` for patterns, `Read` for content |
| **API signatures**     | Do functions have the expected parameters? | `Grep` for function definitions         |
| **Import paths**       | Are package exports available?             | Read `package.json` exports field       |
| **Existing patterns**  | Does the codebase use the assumed pattern? | `Grep` for similar code                 |
| **Naming conventions** | Do new files follow existing naming?       | `ls` existing directories               |
| **Configuration**      | Are config values/env vars available?      | Read config files, `.env.example`       |

### Codebase Red Flags

- Blueprint says `targets/` but codebase uses `emitters/`
- Blueprint imports from `package/subpath` but package.json has no subpath export
- Blueprint extends a class that doesn't exist yet (timing dependency)
- Blueprint assumes a function returns X but it actually returns Y
- Blueprint references env var that isn't in any config

## Phase 3: Architecture Review

**Goal:** Adversarial critique of the architecture — find every way it can break.

### The Adversarial Checklist

Think like a hostile system trying to break the design:

#### Concurrency & Race Conditions

- [ ] What happens if two processes write simultaneously?
- [ ] What happens if operation A completes between steps of operation B?
- [ ] Is there a time-of-check-to-time-of-use (TOCTOU) gap?
- [ ] Can operations interleave in a way that corrupts state?

#### Echo Loops & Infinite Cycles

- [ ] If A triggers B which triggers A, what breaks the cycle?
- [ ] Is the cycle-break mechanism robust to timing variations?
- [ ] Can events batch in a way that bypasses the cycle-break?

#### Error Cascades

- [ ] If step N fails, do steps N+1...M still make sense?
- [ ] Can a partial failure leave the system in an inconsistent state?
- [ ] Is there a dead-letter queue for permanently failed operations?
- [ ] What happens after N retries? Is there a max?

#### Authentication & Sessions

- [ ] What happens when tokens expire during long operations?
- [ ] Is there a refresh mechanism? What if refresh also fails?
- [ ] Do WebSocket connections survive token rotation?

#### Data Integrity

- [ ] Can the ABA problem occur? (A→B→A looks like no change)
- [ ] Are soft deletes propagated correctly in both directions?
- [ ] What happens during schema changes with in-flight data? (Note: repos that prefer `db push` over migrations have different edge cases from migration-based repos.)
- [ ] Can orphaned records accumulate?

#### Platform Constraints

- [ ] Workers: 100s idle timeout, 30s CPU, 128MB memory
- [ ] SQLite: single-writer, no network FS, WAL checkpoint starvation
- [ ] WebSocket: protocol negotiation, heartbeat requirements
- [ ] File watchers: missed events during rapid bursts, git operations

### Output: Severity Classification

| Severity | Definition                                             | Example                                    |
| -------- | ------------------------------------------------------ | ------------------------------------------ |
| CRITICAL | Will cause infinite loops, data loss, or build failure | Echo loop with no break mechanism          |
| HIGH     | Will cause bugs in normal usage                        | Duplicate outbox entries from dual process |
| MEDIUM   | Will cause bugs in edge cases                          | Race condition during schema push          |
| LOW      | Suboptimal but functional                              | Unnecessary payload size                   |

## Phase 4: Cross-Plan Alignment

**Goal:** Ensure the plan is coherent with all related blueprints.

### What to Check

1. **Upstream dependencies** — Are the interfaces/packages this plan depends on still designed the same way?
2. **Downstream impacts** — Do plans that depend on this one need updating?
3. **Shared decisions** — If two plans both chose a technology (e.g., Drizzle ORM), are they using compatible versions/patterns?
4. **Non-goals consistency** — If plan A says "X is out of scope" and plan B says "depends on X from plan A", there's a contradiction.
5. **Timeline consistency** — If plan A depends on plan B Phase 2, is plan B still structured with that phase?

### Cross-Plan Update Protocol

When a fix in Plan A affects Plan B:

1. Read Plan B in full
2. Identify the specific section that needs updating
3. Add a dated architecture note (not a rewrite)
4. Add/update the cross-plan reference in both plans

---

## Phase 5: Blueprint Format Enforcement & Parallelization

> **"If `/pll` can't run 6-8 agents simultaneously, the plan is too coarse."**

**Goal:** Ensure every task follows Blueprint format and the dependency graph maximizes parallelism for `/pll` with Kahn's Algorithm.

The parallel orchestrator is production-ready. This phase ensures plans are structured to maximize parallel agent throughput.

### Task Granularity Optimization (Parallel-First)

**Goal**: Maximize independent tasks while avoiding file conflicts and hidden dependencies.

**Rules of thumb**:

- **1 task = 1 file cluster** (touch 1–3 related files; split if >3 distinct areas)
- **No mixed concerns** (separate UI, data, and infra tasks)
- **Explicit dependencies only** (if a task needs outputs from another, list it in `Depends`)
- **Avoid shared-file contention** (if two tasks touch the same file, either merge or serialize)
- **Target wave size ≥ 6 tasks** for plans intended to run with 6–8 agents

**Split tasks when**:

- A task mixes **setup + implementation + refactor** in one block
- It touches **multiple packages** without a clear sequencing need
- It includes both **schema changes** and **feature code**
- It bundles **tests** for multiple components (split per component)

**Merge tasks when**:

- Two tasks always touch the **same files**
- One task is only **a tiny follow-up** (e.g., rename, lint fix) for another
- Dependencies create a chain with no parallelism

### The Blueprint Task Template (Mandatory)

Every task MUST follow this exact structure:

```markdown
#### [lane] Task X.Y: [Component Name]

**Status:** todo

**Depends:** Task 1.1, Task 1.2 (or "None" for Tier 0)

[Description paragraph — enough context for an independent agent to execute
without reading other tasks. Include: what, why, constraints, gotchas.]

**Files:**

- Create: `exact/path/to/file.ts`
- Create: `exact/path/to/file.test.ts`
- Modify: `exact/path/to/existing.ts`

**Steps (TDD):**

1. Write failing test for [specific behavior]
2. Run: `just test --file <path/to/test-file.test.ts>` — verify FAIL
3. Implement minimal code to pass
4. Run: `just test --file <path/to/test-file.test.ts>` — verify PASS
5. Refactor if needed (complexity ≤ 8)
6. Run: `just lint --file <changed-file.ts> <changed-test.ts>` and `just typecheck --file <changed-file.ts> <changed-test.ts>`

**Acceptance:**

- [ ] Test file created with failing test
- [ ] Implementation passes all tests
- [ ] `just lint --file <changed-files...>` passes
- [ ] `just typecheck --file <changed-files...>` passes
```

Use `#### Task X.Y: ...` only when a lane prefix would add no value, but prefer lane-prefixed headers such as `[schema]`, `[backend]`, `[ui]`, `[infra]`, `[docs]`, or `[qa]`.

### Project Conventions

These are enforced project conventions (with webpresso's conventions as the example):

| Convention           | Rule                                  | Rationale                                                           |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| **Estimates**        | Use t-shirt sizing ONLY (XS/S/M/L/XL) | No day/week estimates — too inaccurate and cause false expectations |
| **Database Changes** | Follow the repo's preferred workflow  | e.g. `db push` before production launch, migrations after           |

**Violations to flag:**

- Task says "1 day", "3 hours", "2 weeks" → Change to t-shirt size
- Task creates migration files or migration infrastructure when the repo prefers `db push` → Use the repo's chosen workflow
- References `just db-migrate` when the repo uses `db push` → Use `db push` (entity YAML → schema generation → push)

### Blueprint Validation Checklist

Run this audit on every task in the blueprint:

| Check                             | Violation                                            | Fix                                               |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Has `**Depends:**` line?          | Missing → `/pll` can't build DAG                     | Add explicit dependency or "None"                 |
| Has `**Files:**` section?         | Missing → agents can't detect file conflicts         | List every file touched (Create/Modify)           |
| Has `**Steps (TDD):**`?           | Missing → agents skip tests                          | Add TDD steps with exact `just` commands          |
| Has `**Acceptance:**` checkboxes? | Missing → no completion criteria                     | Add testable acceptance criteria                  |
| Description self-contained?       | References "see above" or "as described in Task X.Y" | Inline the context — each task runs independently |
| Files overlap with another task?  | Two tasks modify same file → conflict in parallel    | Merge tasks or add explicit `**Depends:**`        |
| Uses t-shirt sizing?              | Day/week estimates used                              | Replace with XS/S/M/L/XL                          |
| Follows repo DB workflow?         | Diverges from repo's chosen workflow                 | Use repo's chosen workflow instead                |

### Granularity Rules

**The Goldilocks Zone:** Each task should be **XS-S size** (single focused change with tests). Smaller = overhead. Larger = blocks other work.

#### Too Coarse (Split It)

```markdown
BAD: "Implement sync engine with push, pull, and connection manager"
```

This is 3+ independent concerns. An agent working on this blocks 30+ minutes while push, pull, and connection could all run in parallel.

```markdown
GOOD: Split into:
Task 3.1: Push engine (client-side) Depends: 2.3
Task 3.2: Pull engine (client-side) Depends: 1.2
Task 4.2: WebSocket auth proxy Depends: None
Task 5.1: Connection manager + orchestrator Depends: 3.1, 3.2, 4.1, 4.2
```

#### Too Fine (Merge It)

```markdown
BAD:
Task 1.1a: Create package.json for sync package
Task 1.1b: Create tsconfig.json for sync package
Task 1.1c: Add subpath exports to package.json
```

These can't be tested independently and have no value as separate agent work.

```markdown
GOOD: "Task 1.2: Scaffold sync package + local DB"
— package.json, tsconfig, exports, db client, tests — all one task
```

### Splitting Rules

| Signal                                       | Action                                    |
| -------------------------------------------- | ----------------------------------------- |
| Task touches 3+ unrelated files              | Split into independent tasks              |
| Task has "and" in the title                  | Split at the "and"                        |
| Task is M or larger                          | Split by concern (data layer, API, tests) |
| Two subtasks have no data dependency         | They should be separate tasks             |
| Task can't start until 3+ other tasks finish | Check if some deps are artificial         |

### Merging Rules

| Signal                                            | Action                                 |
| ------------------------------------------------- | -------------------------------------- |
| Task is XS with no tests                          | Merge with related task                |
| Task creates a file that only one other task uses | Merge into that task                   |
| Three tasks all modify the same file              | Merge or serialize them                |
| Task has no test (pure config/scaffold)           | Merge with the first task that uses it |

### Dependency Graph Optimization

**Goal:** Maximize the width of each wave (more tasks in parallel = faster execution).

#### Wave Analysis

```
Wave 0 (Tier 0): Tasks with no dependencies     → All run in parallel
Wave 1 (Tier 1): Tasks depending only on Wave 0  → Run as Wave 0 completes
Wave 2 (Tier 2): Tasks depending on Wave 0+1     → Run as deps clear
...
```

**Metric: Critical path length** — The longest chain of sequential dependencies. This is the minimum wall-clock time regardless of how many agents you throw at it.

### State-of-the-Art Parallelization Metrics (Required)

Use these metrics when refining or challenging a blueprint:

1. **Ready Width (RW)**
   - Number of runnable tasks at each wave.
   - Target: first two waves should keep planned agents busy (for 6 agents, RW ≥ 6 in Wave 0 or Wave 1).

2. **Critical Path Ratio (CPR)**
   - `CPR = total_tasks / critical_path_length`
   - Higher is better (more theoretical parallel speedup).
   - Target: CPR ≥ 2.5 for parallel plans.

3. **Dependency Density (DD)**
   - `DD = total_dependency_edges / total_tasks`
   - Lower is usually better (fewer coordination constraints).
   - Target: DD ≤ 2.0 unless architecture requires strict sequencing.

4. **Conflict Pressure (CP)**
   - Count of same-file overlaps across tasks in the same wave.
   - Hard target: CP = 0 for every wave.

If metrics miss target, refine task granularity or dependency design before execution.

#### Optimization Techniques

1. **Break false dependencies.** If Task 2.1 "depends on" Task 1.2 but only needs the _interface_ (not the implementation), extract the interface into a Tier 0 task.

2. **Parallelize within phases.** If Phase 2 has 3 tasks that all depend on Phase 1 but not on each other, they should all be in the same wave.

3. **Front-load independent work.** Move tasks that don't depend on anything to Wave 0 — they start immediately.

4. **Minimize the fan-in bottleneck.** If Task 5.1 depends on Tasks 3.1, 3.2, 4.1, and 4.2 — that's 4 tasks that must ALL complete before 5.1 starts. Ask: can any of 5.1's work start earlier?

#### File Conflict Detection

Two tasks running in parallel MUST NOT modify the same file. If they do:

1. **Preferred:** Restructure so each task has its own files
2. **Acceptable:** Add explicit `**Depends:**` to serialize them
3. **Last resort:** Document the conflict in the Quick Reference table

### Quick Reference Table (Required)

Every refined blueprint MUST include this table for `/pll`:

```markdown
## Quick Reference (Execution Waves)

| Wave              | Tasks                             | Dependencies     | Parallelizable | Effort (T-shirt) |
| ----------------- | --------------------------------- | ---------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3                     | None             | 3 agents       | XS-S             |
| **Wave 1**        | 2.1, 2.2, 2.3                     | Wave 0           | 3 agents       | S-M              |
| **Wave 2**        | 3.1, 3.2, 4.2                     | Wave 1 (partial) | 3 agents       | S-M              |
| **Wave 3**        | 4.1, 5.1                          | Wave 2           | 2 agents       | M                |
| **Wave 4**        | 6.1                               | Wave 3           | 1 agent        | S                |
| **Critical path** | 1.1 → 2.3 → 3.1 → 4.1 → 5.1 → 6.1 | —                | 6 waves        | L                |

### Parallel Metrics Snapshot (Required)

| Metric | Formula / Meaning                  | Target               | Actual  |
| ------ | ---------------------------------- | -------------------- | ------- |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | <value> |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | <value> |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | <value> |
| CP     | same-file overlaps per wave        | 0                    | <value> |

If any target misses, include a short "refinement delta" note describing task split/merge changes.
```

### Parallelization Score

Rate the plan's parallelizability:

| Score | Definition                            | Action                              |
| ----- | ------------------------------------- | ----------------------------------- |
| **A** | RW target met, CPR ≥ 2.5, CP = 0      | Ready for `/pll`                    |
| **B** | RW near target, CPR 2.0-2.49, CP = 0  | Improve dependencies before execute |
| **C** | CPR 1.5-1.99 or frequent narrow waves | Split coarse tasks, reduce fan-in   |
| **D** | CPR < 1.5 or CP > 0 in planned waves  | Must restructure before execution   |

### Self-Contained Task Test

For each task, ask: **"Can an agent execute this task with ONLY the task description, the codebase, and `just` commands?"**

If the answer is no, the task is missing context. Common fixes:

- Inline interface definitions (don't say "use the interface from Task 1.1")
- Include the schema/type the task needs to implement
- Specify exact import paths
- Include example input/output for test cases

---

## Phase 6: Apply & Consolidate

**Goal:** Write all fixes into the blueprint as a single coherent update.

### Fix Tagging Convention

Every fix gets an `(Fx)` tag that appears:

1. In the inline task where the fix is applied
2. In the Edge Cases table
3. In the Risks table (if applicable)
4. In the Technology Choices table (if applicable)

This creates **traceability** — anyone reading the blueprint can trace why a particular decision was made back to the fact-check finding.

### Required Updates

After applying all fixes, verify:

- [ ] **Blueprint format** — Every task has Depends, Files, Steps (TDD), Acceptance
- [ ] **Self-contained tasks** — Each task can be executed by an independent agent
- [ ] **No file conflicts** — No two parallel tasks modify the same file
- [ ] **Quick Reference table** — Updated with correct waves and agent counts
- [ ] **Edge Cases table** — Every finding with severity ≥ MEDIUM has a row
- [ ] **Risks table** — Every finding with severity ≥ HIGH has a row with mitigation
- [ ] **Technology Choices table** — Any library/tool changes reflected
- [ ] **Key Decisions table** — Any decision changes reflected with rationale
- [ ] **Cross-Plan References** — Downstream plans updated if affected
- [ ] **Progress field** — Updated to note fact-check completion
- [ ] **Architecture diagram** — Updated if technology names changed

### Verification Report

At the end, produce a summary:

```markdown
## Refinement Summary

| Metric                    | Value                 |
| ------------------------- | --------------------- |
| Findings total            | 20                    |
| Critical                  | 3                     |
| High                      | 5                     |
| Medium                    | 8                     |
| Low                       | 4                     |
| Fixes applied             | 20/20                 |
| Cross-plans updated       | 2                     |
| Edge cases documented     | 15                    |
| Risks documented          | 12                    |
| **Parallelization score** | B (5 tasks in Wave 0) |
| **Critical path**         | 6 waves (~90 min)     |
| **Max parallel agents**   | 3                     |
| **Total tasks**           | 11                    |
| **Blueprint compliant**   | 11/11                 |
```

---

## Red Flags — STOP

Stop and escalate to the user if:

- A CRITICAL finding invalidates the core architecture (e.g., the chosen database doesn't work on the target runtime)
- Two findings contradict each other (fix A requires X, fix B requires not-X)
- A cross-plan dependency is broken and requires re-planning
- The number of CRITICAL + HIGH findings exceeds 10 (plan may need fundamental rethinking)
- A technology assumption affects more than 3 tasks (cascading rewrite needed)
- Parallelization score is **D** (1 task in Wave 0) — plan needs fundamental restructure

## Parallel Agent Strategy

The refinement pipeline itself is designed for parallel execution:

| Agent   | Phase                 | Tools                         | Focus                              |
| ------- | --------------------- | ----------------------------- | ---------------------------------- |
| Agent 1 | Technology Fact-Check | WebSearch, WebFetch, Context7 | Library docs, compatibility, APIs  |
| Agent 2 | Codebase Verification | Grep, Glob, Read              | File paths, existing code patterns |
| Agent 3 | Architecture Review   | Read (blueprint only)         | Adversarial critique, edge cases   |

Agents 1-3 run in parallel. Phases 4-6 (Cross-Plan, Blueprint Enforcement, Apply) run sequentially after all agents complete.

## Related Skills

- **plan** — Creating plans (this skill refines them)
- **question-flow** — Supported user-input pattern for plan clarification
- **testing-philosophy** — Test strategy validation within plans (integration-first, 85% mutation)
- **verify** — Evidence-based completion and post-implementation verification
- **systematic-debugging** — When refinement finds broken assumptions

## Related Commands

- `ak blueprint new "<goal>" --complexity <size>` — Create a new blueprint (this skill refines it)
- `ak blueprint audit --all --strict` — Audit blueprint format/lifecycle before or after refinement
- `/pll` — Operator-facing parallel execution workflow for refined Blueprint-shaped work
- `/verify <target>` — Post-implementation quality gate
- `/soa <target>` — Apply SOA 2026 quality standards (TDD, complexity ≤8, mutation ≥85%)

**Parallel Execution:** Refined plans should execute through the current workflow surface while Blueprint remains the durable lifecycle source of truth via `ak blueprint start|task|finalize`. See `.agent/commands/pll.md` for the current operator guidance.
