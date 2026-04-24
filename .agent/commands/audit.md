---
description: "Unified audit command for code quality, test quality, duplication, and UX audits"
argument-hint: "<type> [target] where type is: code|test|dup|ux|all"
allowed-tools: Bash, Read, Glob, Grep, Task
---

# Audit Command

Unified audit command that consolidates code quality, test quality, duplication, and UX audits.

**Arguments**: $ARGUMENTS

---

## Usage

```bash
/audit <type> [target]
```

Repo CLI equivalent (using this repository's just-based runner):

```bash
just audit <type> [target]
```

Substitute your own task runner (make, npm run, etc.) where needed.

**Types:**

| Type   | Description                                 | Output                                                    |
| ------ | ------------------------------------------- | --------------------------------------------------------- |
| `code` | SOLID, security, complexity, documentation  | `docs/research/quality-audits/code-quality-YYYY-MM-DD.md` |
| `test` | Useless tests, gaps, brittleness, flakiness | `docs/research/quality-audits/test-quality-YYYY-MM-DD.md` |
| `dup`  | Code duplication, extraction candidates     | `docs/research/quality-audits/duplication-YYYY-MM-DD.md`  |
| `ux`   | Error states, loading, a11y, responsiveness | `docs/research/quality-audits/ux-quality-YYYY-MM-DD.md`   |
| `all`  | Run all audits                              | All of the above                                          |

**Examples:**

```bash
/audit code cli               # Audit code quality for cli package
/audit test api               # Audit test quality for api package
/audit dup                    # Find duplication across codebase
/audit ux admin               # UX audit for admin package
/audit all                    # Run all audits
```

---

## Audit Type: `code`

Comprehensive SOLID, security, complexity, and documentation audit.

### Checks

- SOLID principle violations
- Security vulnerabilities (injection, auth, secrets)
- Cognitive complexity > 8
- Missing/outdated documentation
- Dead code (`just analysis-dead-code` or your repo's equivalent)

### Commands

```bash
just lint --package <target>
just analysis-dead-code
```

---

## Audit Type: `test`

Find useless tests, coverage gaps, brittleness, and flakiness.

### Checks

- Tautological assertions (`expect(true).toBe(true)`)
- Mock-heavy tests that don't test real behavior
- Missing edge case coverage
- Flaky tests (timing, order-dependent)
- Low mutation score areas

### Commands

```bash
just test --package <target>
just test --mutation --package <package>
```

### Output Format

Include confidence matrix and `file:line` evidence for each finding.

---

## Audit Type: `dup`

Identify code duplication and extraction candidates.

### Commands

```bash
just audit dup [target]           # Repo CLI equivalent
just analysis-duplication         # Raw jscpd run — console + JSON report
```

### How It Works

- Uses **jscpd** with a minimum of 10 lines / 50 tokens for detection
- Reports both syntactic and semantic duplicates
- Suggests extraction to shared utility or types packages in your repo

### Checks

- Interfaces/types duplicated across packages
- Similar utilities (dates, validation, fetch wrappers)
- Service clients/patterns repeated
- Config duplication (tsconfig/biome/env patterns)

### Output Format

For each extraction candidate:

- **Score**: Duplication severity (1-10)
- **Files**: List of files with duplication
- **Proposed API**: Suggested shared interface
- **Migration Plan**: Steps to consolidate
- **Canonical package**: Recommended shared target when applicable

---

## Audit Type: `ux`

Audit UX quality across error states, loading states, accessibility, responsiveness.

### Checks

- Error state handling (empty, error, loading)
- Accessibility (WCAG 2.1 AA compliance)
- Responsive design breakpoints
- Performance (LCP, FID, CLS)
- Form validation UX

### Output Format

Include severity, location, and user impact for each finding.

---

## Report Template

All audit reports should follow this structure:

```markdown
# [Audit Type] Audit Report

**Date:** YYYY-MM-DD
**Target:** [package/file/scope]
**Auditor:** Claude

## Executive Summary

- Total findings: X
- P0 (Critical): X
- P1 (High): X
- P2 (Medium): X

## Findings

### P0: Critical

#### [Finding Title]

- **Location:** `file:line`
- **Description:** What's wrong
- **Impact:** Why it matters
- **Recommendation:** How to fix

### P1: High

...

## Follow-up Actions

- [ ] Action item 1
- [ ] Action item 2
```

---

## Execution Protocol

1. Parse `$ARGUMENTS` to determine audit type and target
2. Run appropriate checks for the audit type
3. Generate report in the specified output location
4. Summarize findings with P0/P1 highlights

---

## Dead Code Analysis Notes

Use `just analysis-dead-code` (or your repo's equivalent knip runner) carefully before deleting files.

Known false-positive areas:

- Dynamic imports such as `lazy(() => import('./file'))`
- Barrel files (`index.ts`) where consumers import subpaths directly
- React Router generated `+types/*`
- Storybook stories and test utilities
- Pulumi or other infra files loaded indirectly

Verification steps before deleting:

1. Run `just analysis-dead-code` and read the knip log it emits
2. Grep for imports/usages across the relevant package
3. Check for `import()` or `lazy()` usage
4. Confirm the file is not a barrel-only or infra-only entrypoint
5. Never delete a file that might be dynamically loaded without proof
