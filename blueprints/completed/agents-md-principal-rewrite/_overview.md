---
type: blueprint
status: completed
complexity: S
created: "2026-04-21"
last_updated: "2026-04-22"
progress: "0% (drafted)"
depends_on: []
tags:
  - agents
  - docs
  - conventions
---

# Principal-level AGENTS.md rewrite

**Goal:** Replace the OMX-flavoured generated `AGENTS.md` with a
hand-written, principal-engineer-voiced contract that describes how a new
contributor (human or agent) should operate in this repo: where to plan,
where to implement, where to verify, and what the non-negotiables are.

## Planning Summary

- **Current state:** `AGENTS.md` is the OMX auto-generated block, useful for tooling but weak as a human-readable operating contract.
- **Target:** A concise top-level `AGENTS.md` that layers a principal-level contract _above_ the OMX-generated block, framed around: "plan before you code (blueprints), write tests first, leave a lore trailer, never ship behind `--no-verify`." Retain OMX compatibility by keeping the generated markers intact.

## Architecture Overview

```text
AGENTS.md
  # Operating contract (hand-written, 25-year-senior voice)
    - Plan surface: blueprints/ lifecycle, $plan / $plan-refine
    - Implementation surface: pnpm + (vp run) + workspace filters
    - Verification surface: pnpm qa + blueprint:validate + mutation:affected
    - Communication surface: Lore Commit Protocol, ADRs
    - Non-negotiables: no --no-verify, no secrets in code, no blueprint bypass

  # Do-not patterns (hard list)

  # Escalation map

  <!-- omx:generated:agents-md -->
  ... (preserved, machine-owned) ...
  <!-- end omx:generated:agents-md -->
```

## Fact-Checked Findings

| ID  | Severity | Claim                         | Reality                                                                                                   | Fix                                                                                       |
| --- | -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| F1  | MEDIUM   | OMX owns `AGENTS.md` entirely | No. The file supports marker-bounded overlays so hand-written content can live above the generated block. | Use a `<!-- PRINCIPAL:START -->` … `<!-- PRINCIPAL:END -->` region above the OMX markers. |
| F2  | MEDIUM   | Agents read `AGENTS.md`       | Yes; Claude Code, Codex, OMX all read it. It is the single highest-leverage doc.                          | Treat it as the contract; everything else is an elaboration.                              |

## Task Pool

### Phase 1: Draft [Complexity: S]

#### [docs] Task 1.1: Draft principal-layer content

**Status:** pending **Depends:** None

**Files:**

- Modify: `AGENTS.md`

**Acceptance:**

- [ ] Principal region at the top, OMX markers preserved, total length ≤150 lines.
- [ ] Links to `blueprints/README.md`, `.agent/skills/*`, and the `docs/` top pages.

### Phase 2: Alignment [Complexity: S]

#### [docs] Task 2.1: Align `README.md` and `.agent/README.md`

**Status:** pending **Depends:** Task 1.1

**Files:**

- Modify: `README.md`
- Modify: `.agent/README.md`

**Acceptance:**

- [ ] Principal operating contract is referenced from both.
- [ ] No contradictions across the three surfaces.

## Verification Gates

| Gate       | Command                                                           | Success         |
| ---------- | ----------------------------------------------------------------- | --------------- |
| Format     | `pnpm exec prettier --check AGENTS.md README.md .agent/README.md` | Clean           |
| Link check | `lychee AGENTS.md` (optional)                                     | No broken links |

## Cross-Plan References

| Type    | Blueprint                  | Relationship                              |
| ------- | -------------------------- | ----------------------------------------- |
| Related | `adr-lore-commit-protocol` | Referenced from the communication surface |
| Related | `ci-hardening`             | Non-negotiables reference CI gates        |

## Non-goals

- Removing OMX integration.
- Writing per-agent personas.

## Risks

| Risk                                             | Impact | Mitigation                                               |
| ------------------------------------------------ | ------ | -------------------------------------------------------- |
| Hand-written content drifts from machine content | Low    | Markers separate regions; a doc-lint verifies both exist |

## Refinement Summary (2026-04-22 pass)

Findings:

- OMX marker pattern `<!-- omx:generated:agents-md -->` is already present in the current `AGENTS.md`. Confirmed safe region for the principal layer above.
- `.agent/rules/` + `.agent/guides/` + `docs/README.md` all now exist and can be linked from the principal layer. That substantially lowers the risk of Task 1.1 (the hand-written content has real anchors).
- Acceptance "total length ≤ 150 lines" is enforceable via `awk 'NR>150 && /PRINCIPAL:END/'`.

Fixes applied:

- Added concrete line-count enforcement command.

**Blueprint compliant: Yes.** Low-risk, execute any time.
