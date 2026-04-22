---
description: Systematic debugging - find root cause before attempting fixes
---

## Systematic Debugging

Random fixes waste time. Find root cause first.

## Checklist

1. Read the full error/stack trace.
2. Reproduce reliably; note exact steps.
3. Inspect recent changes (diffs, configs).
4. Gather evidence across components (log inputs/outputs).
5. Compare with a working example; list differences.
6. Form one hypothesis and test the smallest change.
7. Write a failing test, fix once, re-run.
8. After 3 failed fixes: stop and question architecture.

Red flags: "quick fix", guessing, multiple fixes at once, or no reproduction.
