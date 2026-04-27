---
description: 'Fix an issue at the root cause, with repo philosophy enforced and verification before claiming done.'
argument-hint: '<target> where target is: file|symptom|error|test|"free-text description"'
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, TaskCreate, TaskUpdate, TaskList
---

# Fix Command

Fix the issue at its root, future-proof, aligned with repo philosophy.

**Arguments**: $ARGUMENTS

This command is a refinement of the ambient request "fix this issue with best practices, future-proof, elegant, aligning with our philosophy." It translates those adjectives into concrete, enforceable gates so the fix is actually bulletproof instead of vibes-bulletproof.

---

## Non-negotiable invariants

A fix that violates any of these isn't done — it's churn. Every rule below should be grounded in your repo's `CLAUDE.md` / agent rules.

1. **Root cause, not symptom.** Trace the failure to the invariant that was actually broken. If the nearest branch would mask the real cause, don't add it.

2. **Loud failures, no silent fallbacks.** No `env.X || 'default'`, no `try { … } catch { return null }`, no auto-provisioning shims that hide missing config. Boundaries validate once, loudly, early.

3. **`unknown` is last resort. `any` is forbidden in production code.** The only permitted `any` is the mock-typing idiom (`vi.fn<(...args: any[]) => unknown>`) that matches existing repo tests.

4. **Zero suppressions.** No `eslint-disable`, `ts-ignore`, `ts-expect-error`, `biome-ignore`, `prettier-ignore`. Fix the code, not the linter.

5. **Cognitive complexity ≤ 8.** Extract helpers before tolerating nesting or long conditionals.

6. **External calls go through the right abstraction.** Network/IO calls should route through your repo's deadline-aware wrapper with a named deadline constant. Never hardcode timeouts.

7. **Secrets come from the repo-owned secret gate.** Missing secrets should throw loudly at boot, aggregated — never silently fall back to a default.

8. **No scope creep.** No tangential refactors bundled with the fix. Adjacent issues → listed as follow-ups, not silently fixed.

9. **No unrequested docs.** Don't create `*.md` files or planning artifacts unless the user asks.

---

## Protocol

### Step 1 — Reproduce + locate the broken invariant

- Run the exact command that surfaces the failure. Capture error, `file:line`, exit code.
- Read surrounding code until you can state **the broken invariant in one sentence**. Examples:
  - "Function X is supposed to return a structured result but throws on a subset of inputs."
  - "Cache Y is supposed to be fresh after step Z but step Z runs after the check that depends on it."
- If the "issue" is actually several issues, stop and ask the user which to fix first.

### Step 2 — Plan aloud (briefly)

State in 1–3 sentences:
- The broken invariant.
- Where the fix belongs (the function/file that owns the invariant — not a caller).
- Whether the fix changes a public contract. If so, name every consumer that will need to update in the same change.

If the blast radius exceeds one file + its direct tests, surface it to the user before editing.

### Step 3 — Implement the minimal correct fix

- Edit the file that owns the invariant. Don't paper over it at callers.
- Update every consumer of a changed contract in the same change — no half-migrations.
- Add or strengthen a test that **would have caught the original bug against the old code**. "New tests that exercise the new path" are not sufficient.
- Delete compat shims, dead aliases, and TODOs that the fix makes obsolete.
- Do not add comments that restate the code. Only write a comment for a non-obvious *why* (hidden constraint, workaround for a specific bug). See CLAUDE.md "Doing tasks".

### Step 4 — Verify (evidence before claims)

Run the minimum required for the changed surface:

```bash
just lint --file <changed-files>
just typecheck --package <affected-package>
just test --file <changed-test-files>
```

If the fix crosses packages or touches public surface, run `/verify <target>` for the full gate.

### Step 5 — Report

Short. Cite evidence, not intent.

- 1–2 sentences: what invariant broke, how the fix restores it.
- Test count + exit codes or log paths.
- Adjacent issues noticed but not fixed → list as follow-ups.

---

## Done looks like

- [ ] Root cause named in one sentence
- [ ] Minimal diff restores the invariant at its owner
- [ ] No silent fallback, no `any`, no suppression, no compat shim added
- [ ] Tests would fail against the old code
- [ ] `just lint` + `just typecheck` + `just test` pass on the changed surface
- [ ] Report cites concrete evidence (log paths, exit codes, test counts)

---

## Anti-patterns this command refuses

- Patching the symptom when the invariant is fixable upstream
- Wrapping a broken call in try/catch and returning a sentinel ("defensive programming")
- Adding a deprecation alias instead of updating callers
- Introducing `any` / `ts-ignore` / `eslint-disable` to unblock the fix
- Bundling unrelated refactors with the fix
- Claiming done without running the verification commands
- Writing a docs/planning file when the user asked for a fix
