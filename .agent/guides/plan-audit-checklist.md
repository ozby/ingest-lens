---
type: guide
last_updated: "2026-04-21"
---

# Plan audit checklist

Run this checklist weekly (or at the start of any session that touches
multiple blueprints). Drift between the blueprint index and reality is
the single biggest source of "we planned that, didn't we?" incidents.

## 15-minute audit

### 1. Index ↔ filesystem parity (2 min)

```bash
pnpm blueprint:validate
```

- Every directory under `blueprints/<lifecycle>/` has `_overview.md`.
- Every `_overview.md` frontmatter `status` matches its directory.
- The table in `blueprints/README.md` lists every active slug.

### 2. Status truth (3 min)

For each blueprint listed in `blueprints/README.md`:

- Does the `status` frontmatter match what is **actually** happening on branches?
- Does the `progress:` line roughly match the task checklist inside?
- Is a "planned" blueprint blocked waiting on something? Add a `Blocked:` line to the relevant task.

### 3. Cross-plan references (3 min)

Grep for blueprint slugs in `Cross-Plan References` tables.

- Every referenced slug must exist under some lifecycle directory.
- Upstream/downstream direction must be honest. If blueprint A says it depends on B, B's `depends_on` frontmatter should list A somewhere in its downstream references.

### 4. Stale assumptions (4 min)

Open the two blueprints most likely to be stale (oldest `last_updated` among `planned`):

- Do the referenced file paths still exist?
- Do the referenced commands still work (`pnpm run --if-present <name>`)?
- Have upstream blueprints landed changes that invalidate a downstream plan?

If anything is stale: update `last_updated`, fix the references, and note
the audit in the commit message.

### 5. Quick commit (3 min)

```bash
git status
git add blueprints/
git commit -m "docs(blueprints): weekly audit — fix status mismatches and lifecycle placement"
```

## Metrics to track

Record these in the sprint notes or a repo-level dashboard:

| Metric                                          | Target | Why                                             |
| ----------------------------------------------- | ------ | ----------------------------------------------- |
| Validator errors                                | 0      | Blueprints should always be accurate            |
| Warnings                                        | < 5    | Some drift is normal; minimize it               |
| Blueprints in `planned/` > 60 days old          | ≤ 3    | Stale plans are either parked or executed       |
| `in-progress/` blueprints with no recent commit | 0      | If no one's working on it, move it to `parked/` |
| Cross-plan references that 404                  | 0      | References must resolve                         |

## When to escalate

- More than 10 validator errors → something structural changed; freeze new blueprint authoring and fix the validator.
- A blueprint in `in-progress/` for > 4 weeks with no commits → stakeholder conversation, not a doc fix.
- Two blueprints with overlapping `**Files:**` and neither lists the other as a dependency → merge or split. Do not let them race.
