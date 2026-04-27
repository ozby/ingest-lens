---
paths:
  - '**/*'
---

# Command Execution Rules

## BOOKEND Rule: Full QA Runs Exactly Twice

The full QA pipeline (e.g. `just qa`, `pnpm qa`, `turbo run check`) is a
**bookend command** — run it once at the START and once at the END. Never in
between.

```
START:  qa command              → captures baseline (minutes)
MIDDLE: scoped commands only    → fast iteration (seconds each)
END:    qa command              → final verification (minutes)
```

### Scoped Commands (Use These In Between)

Use the narrowest scope that proves your change:

| Concern    | Scoped form                          |
| ---------- | ------------------------------------ |
| Lint       | `lint --file <paths...>` / `--package <name>` |
| Tests      | `test --file <paths...>` / `--package <name>` |
| Typecheck  | `typecheck --package <name>`         |

**Multi-target:** `--file` and `--package` typically accept multiple
space-separated values. Check your repo's task runner for the exact flag
surface.

### Log Files

If the repo's task runner saves output to timestamped logs, treat the log file
as the source of truth. Re-reading a log is always cheaper than re-running the
command.

Common conventions:

- One log per command invocation
- QA runs may split into several stage logs (root checks, typecheck, test)
- Log path is displayed after the command completes

Do not assume the newest log alone is the source of truth. Check related
stage logs and confirm progress with file `mtime`/size changes. If logs are
unchanged, verify whether the underlying process is still alive before
treating the run as stalled.

**Critical:** Read the log file after completion. Never re-run to check
results.

**Forbidden:** Never pipe quality commands (e.g., `test | grep`). Piping
breaks auto-logging and hides real output.

## Other Rules

- Always use the repo-owned command wrappers (`just`, `pnpm`, `turbo`, etc.)
  for repo-owned workflows. Do not invoke underlying tools directly when a
  wrapped recipe exists.
- If you are about to run `vitest`, `test`, `lint`, `typecheck`, `build`,
  `qa`, `e2e`, or repo CLIs directly through a package manager, stop and look
  for the wrapped recipe first.
- Prefer the repo's recipe surface over raw package-manager execution when
  the repo expects a wrapped CLI invocation.
- Never pipe quality commands at all — they typically auto-log (and piping
  may be blocked by pretool hooks).
