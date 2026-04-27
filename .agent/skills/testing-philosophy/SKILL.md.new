---
name: testing-philosophy
description: Codifies the integration-first, anti-mocking testing philosophy with an 85% mutation-score target. Prevents low-quality "bullshit tests" that give false confidence. Use when writing ANY test, reviewing test quality, or when tests pass but production fails.
---

# Testing Philosophy

## Core Philosophy

**Integration tests give confidence. Unit tests give speed. Bullshit tests give false confidence.**

### The Iron Laws

1. **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST** (TDD enforced)
2. **E2E tests NEVER call internal APIs** - must go through HTTP/browser
3. **85%+ mutation score** for new logic code
4. **Test strategy: Integration-first (Trophy), Unit-scaled (Pyramid)**
   - Start with integration tests for confidence
   - Extract unit tests for speed
   - Target: ~70% unit, ~15% integration, ~5% worker, ~10% E2E

## What Makes a Test "Bullshit"

| Bullshit Pattern                | Why It's Bad                               | Detection                        |
| ------------------------------- | ------------------------------------------ | -------------------------------- |
| **Mocking the database**        | Tests pass even if SQL is completely wrong | `vi.mock('../database')`         |
| **Mocking business logic**      | Never tests actual logic, just mocks       | `vi.mock('../services')`         |
| **Mocking framework internals** | Real middleware/validation never runs      | Mocking Hono context             |
| **Testing implementation**      | Breaks on refactoring, tests nothing real  | `expect(spy).toHaveBeenCalled()` |
| **Tautological assertions**     | Tests that `true === true`                 | `expect(result).toBeTruthy()`    |
| **Over-mocking** (>5 mocks)     | Integration in disguise, slower            | `>5 vi.mock()` calls             |

**If your tests pass but production fails, you have bullshit tests.**

## Unit Tests vs E2E Tests: What They Actually Test

**Critical Distinction**: Unit tests verify **implementation**, E2E tests verify **user experience**.

### Unit Tests Miss UX Issues

| What Unit Tests Check                   | What They Miss                                                   | What E2E Tests Catch          |
| --------------------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| "Does function throw on invalid input?" | Can users still accomplish their task when some data is invalid? | Graceful degradation patterns |
| "Does function return correct type?"    | Is the error message helpful to users?                           | User-facing error clarity     |
| "Does function handle null?"            | Can users recover from errors?                                   | Error recovery workflows      |
| 100% valid or 100% invalid scenarios    | Mixed scenarios (50% valid, 50% invalid)                         | Real-world data mixtures      |

### Red Flags: Unit Tests Testing Wrong Thing

**Warning signs your unit tests might miss UX issues:**

1. **`expect(...).rejects.toThrow()` without graceful degradation test**

   ```typescript
   // DANGER: Tests that function throws, not that users can recover
   await expect(service.listItems()).rejects.toThrow('Invalid item')

   // BETTER: Test graceful degradation
   const items = await service.listItems()
   const validItems = items.filter((i) => !i.malformed)
   expect(validItems.length).toBeGreaterThan(0) // Can still see valid items
   ```

2. **Testing 100% success and 100% failure, but not 50% success**

   ```typescript
   // INCOMPLETE: Only tests extremes
   it('should list all items when all valid', ...)
   it('should throw when all invalid', ...)

   // COMPLETE: Tests mixed scenarios
   it('should list valid items even when some are invalid', ...)
   ```

3. **No integration/E2E test for "user wants to browse/list" operations**

   ```typescript
   // MISSING: No test for user browsing with mixed data
   // Unit tests only: listItems() with all valid, listItems() with all invalid

   // ADD: E2E test for browsing
   it('should show all valid items in list even if some are corrupted', async () => {
     await createValidItem('item-1')
     await createInvalidItem('corrupted')
     await createValidItem('item-2')

     await actionFn('list', [], {})

     expect(output).toContain('item-1') // User sees valid items
     expect(output).toContain('item-2')
     expect(output).toContain('corrupted') // Indicated as error
   })
   ```

### Case Study: List Command Bug

**Scenario**: `listBlueprints()` threw error on first invalid blueprint, preventing users from seeing ANY blueprints.

**Why Unit Tests Didn't Catch It**:

```typescript
// <package>/src/service/BlueprintService.test.ts
it('should throw readable error for Zod validation failures', async () => {
  // ...invalid blueprint setup...
  await expect(service.listBlueprints()).rejects.toThrow('Invalid frontmatter')
  // Test PASSES — function throws as expected
  // BUT: Users can't see ANY blueprints if ONE is invalid
})
```

**How E2E Test Caught It**:

```typescript
// <package>/src/commands/blueprint/router.integration.test.ts
it('should handle listing with mixed valid and invalid blueprints', async () => {
  await createBlueprint('valid-1')
  await createBlueprint('valid-2')
  await createInvalidBlueprint('corrupted')

  await actionFn('list', [], { tui: false })

  expect(output).toContain('valid-1') // FAILS — entire list crashed
  // Discovered: "fail fast" design is poor UX for list operations
})
```

**Fix**: Return malformed summary instead of throwing, enabling graceful degradation.

**Lesson**: Unit test verified code did what was written (throw on error), but E2E test verified code did what users need (show valid items).

### When to Suspect Unit Tests Miss UX

**High-risk scenarios for UX issues:**

1. **List/Browse operations** - Users expect to see valid items even if some are invalid
2. **Batch operations** - Users expect partial success, not all-or-nothing
3. **Error handling** - Users expect helpful messages and recovery paths
4. **Multi-step workflows** - Users expect graceful degradation at each step
5. **Validation** - Users expect specific field errors, not "invalid input"

**Action**: For these scenarios, ALWAYS write E2E tests that verify user experience, not just unit tests that verify implementation.

## Test File Naming Convention (ENFORCED)

**Critical**: Test file names MUST match their test type.

| Test Type   | File Pattern            | When to Use                      |
| ----------- | ----------------------- | -------------------------------- |
| Unit        | `*.test.ts`             | Pure functions, no dependencies  |
| Integration | `*.integration.test.ts` | Real DB, real services, file I/O |
| Vitest E2E  | `*.e2e.ts`              | Worker/API end-to-end coverage   |
| Playwright  | `*.spec.ts`             | Browser, HTTP, full stack        |
| Worker      | `*.workers.test.ts`     | Cloudflare Workers runtime       |

**Enforcement**:

- GritQL rule: `enforce-integration-test-naming.grit`
- Files using `PGlite`, `createIntegrationContext`, `seedTestScenario` MUST be `.integration.test.ts`
- Files using real services without mocking MUST be `.integration.test.ts`
- Violation = Lint error

## When to Write Each Test Type

### Unit Tests (70% - Fast, <10ms)

**When**: Pure functions, validators, formatters, utilities with NO dependencies

```typescript
// GOOD - pure function, no deps
export function generateSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-')
}

describe('generateSlug', () => {
  it('should convert to lowercase', () => {
    expect(generateSlug('MyProject')).toBe('myproject')
  })
})
```

**STOP and use Integration if:**

- Function queries database → Use `.integration.test.ts`
- Function uses external service → Mock only that service
- Function has complex state → Integration test

**Example**: Router tests separated by type

- `router.test.ts` - Pure function tests (appendOption, buildFakeArgv)
- `router.integration.test.ts` - Real command execution, real filesystem

### Integration Tests (15% - Confidence, 10-100ms)

**When**: Database queries, handlers, services with real dependencies

```typescript
// GOOD - real database with PGlite
import { createIntegrationContext } from '~/test-utils'

describe('Project Service', () => {
  let ctx: IntegrationContext

  beforeAll(async () => {
    ctx = await createIntegrationContext()
  })

  it('should create project', async () => {
    const project = await createProject(ctx.db, {
      organizationId: ctx.orgId,
      name: 'Test Project',
    })

    // Verify REAL database state
    const saved = await ctx.db.query.projects.findFirst({
      where: eq(schema.projects.id, project.id),
    })

    expect(saved.name).toBe('Test Project')
  })
})
```

**Key**: Use `createIntegrationContext()` or `seedTestScenario()` - never mock the DB.

**E2E Requirements for Commands/Features:**

When adding a new command or feature, you MUST have:

1. **Routing test** - Verifies command is recognized (integration)
2. **E2E test** - Verifies command actually works end-to-end
   - Creates real files/data
   - Verifies actual output
   - Tests with real options
   - No dry-run mode
3. **Error handling test** - Verifies helpful error messages
4. **Edge case tests** - Invalid input, missing data, etc.

**Example**: Blueprint `new` command

```typescript
// GOOD - Full E2E coverage
describe('E2E: blueprint new command', () => {
  it('should create actual blueprint file with correct structure', async () => {
    await actionFn('new', ['test-bp'], {})

    // Verify REAL file was created
    const content = await readFile(blueprintPath, 'utf8')
    expect(content).toContain('type: blueprint')
  })

  it('should reject invalid complexity with helpful error', async () => {
    await actionFn('new', ['test'], { complexity: 'INVALID' })
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Must be one of: XS, S, M, L, XL'),
    )
  })
})
```

**WRONG - Routing only (insufficient)**

```typescript
it('should route to new command', async () => {
  await actionFn('new', ['test'], { 'dry-run': true })
  expect(exitSpy).not.toHaveBeenCalled() // Proves nothing!
})
```

### E2E Tests (10% - Journeys, 1-30s)

**When**: Critical user journeys, cross-service workflows

```typescript
// GOOD - real HTTP through browser
test('complete signup flow', async ({ page }) => {
  await page.goto('http://localhost:3001/signup')
  await page.fill('[name="email"]', 'test@example.com')
  await page.click('button[type="submit"]')
  await expect(page.locator('text=Welcome')).toBeVisible()
})
```

**NEVER**: Call internal handlers directly

```typescript
// WRONG - bypasses HTTP stack
const response = await auth.handler(request)
```

## Anti-Patterns (NEVER DO)

### Anti-Pattern 1: Mocking the Database

```typescript
// BULLSHIT - tests mock, not real code
vi.mock('../database', () => ({
  getDb: vi.fn(() => ({
    query: { projects: { findMany: vi.fn().mockResolvedValue([]) } },
  })),
}))

it('should list projects', async () => {
  const result = await listProjects('org-1')
  expect(result).toHaveLength(0) // Always passes, tests nothing
})
```

**Fix**: Use PGlite integration tests

### Anti-Pattern 2: Testing Implementation Details

```typescript
// BULLSHIT - breaks on refactoring
it('should call validateInput', async () => {
  const spy = vi.spyOn(utils, 'validateInput')
  await processRequest(mockInput)
  expect(spy).toHaveBeenCalledWith(mockInput)
})
```

**Fix**: Test behavior and outcomes

```typescript
// GOOD - tests actual behavior
it('should reject invalid input', async () => {
  const result = await processRequest(ctx.db, { name: '' })
  expect(result.success).toBe(false)
  expect(result.error).toContain('name is required')
})
```

### Anti-Pattern 3: Weak Assertions

```typescript
// WEAK - allows equivalent mutants
expect(result).toBeTruthy()
expect(array).toHaveLength(3)

// STRONG - kills mutants
expect(result.error).toBe('Entity not found')
expect(users.map((u) => u.email)).toEqual(['a@test.com', 'b@test.com'])
```

## Mutation Testing (85% Target)

### Patterns to Kill Mutants

#### Pattern 1: Export Private Helpers

Export **pure utility functions** for direct testing to kill mutants. This is the primary mutation-killing pattern.

**When to export**:

- Pure functions with no side effects (formatters, parsers, validators)
- Functions that transform data deterministically
- Helper functions that are independently meaningful

**When NOT to export** (test through the public API instead):

- React hook internals — test via `renderHook` from `@testing-library/react`
- Functions that only make sense in context of their parent (internal state machines)
- Trivial one-liners that are better tested through their caller

```typescript
// GOOD — pure utility, export and test directly
export function formatProjectName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

describe('formatProjectName', () => {
  it('should trim whitespace', () => {
    expect(formatProjectName('  Project  ')).toBe('project')
  })
  it('should replace spaces with hyphens', () => {
    expect(formatProjectName('My Project')).toBe('my-project')
  })
})

// GOOD — pure parsing/error handling, export and test in node env
// (from use-service-health.ts)
export function parseHealthResponse(body: ReadinessResponse): HealthCheckResult { ... }
export function handleFetchError(error: unknown): HealthCheckResult { ... }

// WRONG — don't export hook internals, test via renderHook
// export function usePollLogic() { ... } // internal to useServiceHealth
// Instead: renderHook(() => useServiceHealth({ services, pollInterval: 5000 }))
```

**Hybrid approach** (best of both worlds): When a hook contains pure logic + React lifecycle:

1. Extract pure functions → export and test directly (node env, fast)
2. Test hook lifecycle (polling, cleanup, state) → `renderHook` (DOM env, slower)
3. This gives maximum mutation coverage with minimum test complexity

#### Pattern 2: Test Exact Outputs

```typescript
// Weak - mutant survives
expect(result).toBeTruthy()

// Strong - mutant killed
expect(result.error).toBe('Entity not found')
expect(result.statusCode).toBe(404)
```

#### Pattern 3: Test Boundary Conditions

```typescript
describe('formatCount', () => {
  it('should use singular for 1', () => {
    expect(formatCount(1, 'project')).toBe('1 project')
  })
  it('should use plural for 0', () => {
    expect(formatCount(0, 'project')).toBe('0 projects')
  })
  it('should use plural for multiple', () => {
    expect(formatCount(5, 'project')).toBe('5 projects')
  })
})
```

### Low-Value Survivors (Ignore These)

- Array declaration mutations (`[] → ["Stryker"]`)
- Logging branches (`if (debug) logger.log(...)`)
- Optional chaining where null is impossible

## Test Quality Checklist

Before claiming a test is "done":

- [ ] **Does it use real dependencies?** (PGlite for DB, real services)
- [ ] **Are assertions specific?** (Not just `toBeTruthy()`)
- [ ] **Does it test behavior, not implementation?** (No spy assertions)
- [ ] **Mutation score ≥85%?** (Run `just test --mutation --package <pkg>`)
- [ ] **Does it fail if the code breaks?** (Temporarily break code, verify test fails)
- [ ] **Is it in the right file?** (`.test.ts` for unit, `.integration.test.ts` for DB)

## Mock Budget

| Test Type       | Max `vi.mock()` | What to Mock                                        |
| --------------- | --------------- | --------------------------------------------------- |
| **Unit**        | 0-2             | Only pure external services (Stripe, Email)         |
| **Integration** | 0-3             | Only infrastructure you can't run (real containers) |
| **E2E**         | 0               | Nothing - use real services                         |

**Warning**: >5 mocks → Convert to integration test

## Quick Commands

These assume a `just`-based task runner; substitute your own as needed.

```bash
# Run tests
# WARNING: Never run full suites during iteration. Use single-file verification.
just test                    # All tests (FINAL VERIFICATION ONLY)
just test <package>          # Specific package (FINAL VERIFICATION ONLY)
just test path/to/test.ts    # Single file (ITERATION SAFE)

# Mutation testing
just test --mutation --package <package>  # Full mutation test
just test --mutation-diff           # Changed packages only

# Audit quality
just test --mutation --package <package> # Check mutation score for package
just audit-ratios            # Check test pyramid (70/15/5/10)
just qa                      # Full quality check
```

## Decision Tree

```
What are you testing?
│
├─ Pure function (no deps) ──────→ .test.ts (Unit)
│
├─ Database queries ─────────────→ .integration.test.ts (PGlite)
│
├─ Service with deps ────────────→ .integration.test.ts
│
├─ Workers/DO/Cloudflare APIs ───→ .workers.test.ts
│
└─ Full user journey ────────────→ .spec.ts (Playwright)
```

## Red Flags - STOP

If you find yourself:

- Writing `vi.mock('../database')` → **STOP** → Use PGlite
- Testing that a spy was called → **STOP** → Test behavior
- Using `toBeTruthy()`, `toBeDefined()`, or `toBeTypeOf()` → **STOP** → Test exact values (type-only assertions like `toBeTypeOf('string')` are equally weak — a mutant changing `'alice'` to `'bob'` still passes)
- Using `toHaveProperty('key')` without a value → **STOP** → Use `toHaveProperty('key', expectedValue)` or `toEqual()` — without the value arg it's just `toBeDefined()` for a property
- Using `.length).toBeGreaterThan(0)` → **STOP** → Assert exact count with `toHaveLength(n)` or assert exact contents with `toEqual()`/`toContain()`. "At least one" lets mutants add/remove items freely
- Using `toMatch(/partial/)` when the full value is known → **STOP** → Use `toBe(fullValue)`. Partial matches let mutants change the unmatched portion
- Using `toContain(oneItem)` on arrays when all items are known → **STOP** → Use `toEqual([...allItems])`. Subset assertions let mutants modify unchecked items
- Writing >5 mocks in one file → **STOP** → Use integration test
- Tests pass but you're not confident → **STOP** → Add integration tests

## Industry Context

These testing standards are intentionally ambitious relative to industry norms:

- **Google** kills ~87% of mutants globally, uses diff-based mutation testing (not global threshold)
- **Meta** uses LLM-guided mutation testing for compliance-critical code
- **Sentry** targets ~62% mutation score on their JS SDK
- An **85% target for core logic** is top-tier and intentional — it reflects the high-reuse nature of shared packages
- **SMURF framework** (Google, Oct 2024): Speed, Maintainability, Utilization, Reliability, Fidelity — validates the Trophy→Pyramid hybrid approach where unit tests excel at SMUR and integration/E2E excel at Fidelity

### TDD + AI Agents

TDD is MORE important with AI-assisted development, not less. AI agents can generate code that passes superficial checks but misses edge cases. The failing test acts as a specification that constrains the AI's output.

> "TDD is a superpower when working with AI agents."
> — Kent Beck, Pragmatic Engineer podcast, June 2025

## Related Skills

- **test-driven-development** - TDD workflow
- **systematic-debugging** - When tests pass but prod fails
- **verify** - Verify before claiming done
