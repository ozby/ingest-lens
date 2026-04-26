---
type: core
last_updated: 2026-04-22
---

# Weekly Plan Audit Checklist

**Frequency**: Every Monday (or start of sprint)
**Duration**: ~15 minutes
**Owner**: Lead developer or project manager

## Purpose

Prevent plan drift by ensuring implementation plans accurately reflect
reality:

- Status matches actual work state
- Plans are in correct lifecycle folders (`draft/`, `planned/`, `parked/`,
  `in-progress/`, `completed/`, `archived/`)
- Future plans stay concise (vision docs, not implementation specs)
- In-progress plans show recent progress

## Quick Start

```bash
ak blueprint audit --all --strict
```

## Review Process

### 1. Run Audit (2 min)

```bash
ak blueprint audit --all --strict
```

If exit code is 0 → ✅ No issues, done.
If exit code is 1 → 🔍 Review errors and warnings below.

### 2. Fix Errors (5-10 min)

### Priority: P0 (must fix)

Fix errors in this order:

#### Invalid Status Values

- **Issue**: Blueprint frontmatter `status` must be one of: `draft`,
  `planned`, `parked`, `in-progress`, `completed`, `archived`. There is no
  blueprint-level `blocked` or `backlog`; for external dependency waits, set
  the task **Status:** to `blocked` and add a non-empty **Blocked:** line
  with the reason.
- **Action**: Update frontmatter to use a valid enum value
- **Example**: Change `status: draft` → `status: planned` when the blueprint
  is queued but not started

#### Missing Required Fields

- **Issue**: Missing `type`, `status`, `complexity`, `last_updated`
- **Action**: Add missing fields to frontmatter
- **Example**:

```yaml
---
type: blueprint
status: planned
complexity: M
last_updated: 2026-04-22
---
```

#### Lifecycle Misplacement

- **Issue**: Status doesn't match folder location
- **Actions**:
  - `status: completed` → move to `completed/`
  - `status: archived` → move to `archived/`
  - `status: planned` → move to `planned/`
  - `status: parked` → move to `parked/`
  - `status: in-progress` → move to `in-progress/` (includes blueprints with
    blocked tasks)
  - `status: draft` → move to `draft/`
- **Command**: `ak blueprint move <slug> <status>`
- **Note**: `move` is a recovery/repair action for mismatched lifecycle
  state. For normal completion flow, use `ak blueprint finalize <slug>`.

### 3. Review Warnings (5 min)

### Priority: P1 (should fix soon)

#### Future Plans Too Long (>600 lines)

- **Issue**: Future plan is detailed implementation spec, not vision doc
- **Action**: Simplify to ~500 lines
- Keep: Problem, solution, phases, research, key insights
- Remove: Detailed schemas, step-by-step tasks, implementation code
- **Guideline**: If someone can implement from the plan without asking
  questions → too detailed

#### Active Plans Too Long (>2000 lines)

- **Issue**: Plan is likely over-engineered
- **Action**: Break into smaller sub-initiatives OR simplify approach
- **Decision point**: Does this need to be one epic plan, or should it be
  2-3 separate initiatives?

#### Stale In-Progress Plans (>3 months)

- **Issue**: Plan claims "in-progress" but not touched in 3+ months
- **Actions**:
  1. Check if work is actually happening → Update `last_updated` and add
     progress
  2. Work paused temporarily → Change to `parked`, `draft`, or `planned` and
     move folder to match
  3. Work abandoned → Move to `archived/`

#### Missing Progress Field

- **Issue**: In-progress plans should track progress
- **Action**: Add progress field to frontmatter
- **Example**:

```yaml
progress: "Phase 1: ✅ 100%, Phase 2: ⏳ 30%, Phase 3-5: 0%"
```

### 4. Commit Fixes (3 min)

```bash
git status # Review changes
git add blueprints/
git commit -m "docs: weekly plan audit - fix status mismatches and lifecycle placement"
```

## Metrics to Track

Record in sprint notes or project wiki:

| Metric                   | Target   | Why                                   |
| ------------------------ | -------- | ------------------------------------- |
| Errors found             | 0        | Plans should always be accurate       |
| Warnings found           | <5       | Some drift is normal, but minimize it |
| Plans moved to completed | 1-3/week | Shows delivery velocity               |
| Plans simplified         | 0-1/week | Prevents scope creep                  |

## Automation (Future)

**Current**: Manual weekly run
**Future**: Add to CI pipeline (warn on PR, don't block)

When to automate:

- ✅ Team consistently runs weekly (3+ months)
- ✅ Errors rarely found (<2/week)
- ✅ Process is well-understood

## Common Issues

### "Plan says in-progress but nothing shipped in 6 months"

→ Move to `parked/`, `planned/`, `draft/`, or `archived/` (and set status
accordingly). Don't lie to yourself about priorities.

### "Future plan has 2000+ lines of implementation details"

→ You're doing BDUF (Big Design Up Front). Simplify to vision doc, implement
incrementally.

### "We keep forgetting to finalize completed plans"

→ Add to your Definition of Done: "Run `ak blueprint finalize <slug>` and add
retrospective"

### "Audit finds issues every week in the same plans"

→ Those plans are not being maintained. Either delete them or assign an
owner.

## Success Criteria

✅ Audit runs in <5 minutes
✅ Zero errors every week
✅ <5 warnings every week
✅ Team trusts plans as source of truth (not "docs are always outdated")

---

**Last Updated**: 2026-04-22
**Next Review**: When process breaks down or team grows >5 people
