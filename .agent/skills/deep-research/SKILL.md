---
name: deep-research
description: Deep web research with credible pro/con sentiment, 2026 best practices, project vision alignment analysis, and timestamped output to docs/research/
argument-hint: "<subject or question to research>"
---

<Purpose>
Deep Research is a multi-phase web research workflow that produces a balanced, citation-backed analysis of a subject. It collects both positive and negative sentiments from credible sources, evaluates alignment with the project's vision and tech stack, identifies 2026 state-of-the-art best practices, and logs the result to `docs/research/` with a date-prefixed filename.
</Purpose>

<Use_When>

- Evaluating a technology, library, pattern, or product direction
- Comparing alternatives before making an architectural or product decision
- The user says "research", "deep research", "investigate", or "what does the community think about"
- You need a balanced view of trade-offs before recommending something
  </Use_When>

<Do_Not_Use_When>

- The user wants a quick factual lookup (use WebSearch directly)
- The user wants codebase exploration (use explore)
- The user wants a requirements interview (use deep-interview)
- The answer is already well-established and non-controversial
  </Do_Not_Use_When>

<Output_Contract>
A single markdown file written to:

```
docs/research/{YYYY-MM-DD}-{slug}.md
```

Where `{YYYY-MM-DD}` is today's date and `{slug}` is a kebab-case summary of the subject.

The file MUST have this frontmatter and structure (see Phase 5 for full template).
</Output_Contract>

<Steps>

## Phase 0: Scope and Context Load

1. Parse `{{ARGUMENTS}}` into a research subject and any qualifiers (e.g., "for our use case", "vs X").
2. Derive a short kebab-case slug for the filename.
3. Read `docs/research/product/VISION.md` (or the project's equivalent — check `docs/` for a vision doc) to load the current vision context. Skip if not present.
4. Identify the relevant tech stack context by reading project config files (e.g., `package.json` workspaces, `tsconfig.json`, key dependencies) — keep this lightweight, just enough to judge alignment.
5. Announce the research plan to the user:
   - Subject
   - Key questions to investigate
   - Output path

## Phase 1: Broad Discovery (parallel)

Run **5-8 parallel WebSearch queries** covering different angles:

1. **Overview**: `"{subject} 2026 overview best practices"`
2. **Positive sentiment**: `"{subject} benefits advantages why use 2026"`
3. **Negative sentiment / criticism**: `"{subject} problems criticism drawbacks 2026"`
4. **Community opinion**: `"{subject} reddit hacker news experience production 2026"`
5. **Comparison / alternatives**: `"{subject} vs alternatives comparison 2026"`
6. **State of the art**: `"{subject} state of the art latest 2026"`
7. **(If applicable)** Stack-specific: `"{subject} TypeScript Cloudflare Workers React 2026"`
8. **(If applicable)** Domain-specific query based on the project's problem space

For each search, record:

- Source URL
- Source type (docs, blog, forum, official, academic)
- Key claims or data points
- Sentiment direction (positive / negative / neutral)

## Phase 2: Deep Dive (sequential, selective)

From Phase 1 results, identify the **5-10 most credible and information-dense sources**.

Use `WebFetch` on each to extract deeper detail. Prioritize:

- Official documentation or announcements
- Production experience reports (postmortems, migration stories)
- Benchmark data or technical comparisons
- Strong critical takes with specific evidence

For each fetched source, extract:

- Specific claims with evidence
- Sentiment and strength (strong positive, mild positive, neutral, mild negative, strong negative)
- Credibility assessment (official docs > production experience > blog opinion > forum anecdote)

## Phase 3: Triangulate and Score

1. **Cluster findings** into themes (e.g., "developer experience", "performance", "ecosystem maturity", "production readiness").
2. **Cross-reference claims**: if only one source makes a claim, flag it as unverified. Claims supported by 2+ independent sources get higher weight.
3. **Score source credibility** using:
   - Official docs / specs: high
   - Production postmortems with data: high
   - Respected engineering blogs: medium-high
   - Community forums (HN, Reddit) with detail: medium
   - Marketing material / vendor blogs: low (note bias)
   - Undated or anonymous content: very low
4. **Identify gaps**: what questions remain unanswered? If critical gaps exist, run 1-2 additional targeted searches.

## Phase 4: Vision and Stack Alignment Analysis

Using the project's vision from Phase 0 and the research findings:

1. **Vision alignment**: How does this subject relate to the project's stated mission? Does it help or hinder current priorities?
2. **Tech stack fit**: How well does this integrate with the existing stack (read `package.json`, key deps, framework choices)? What's the integration cost?
3. **Trade-off assessment**: Given the project's current stage, what are the most relevant trade-offs?
4. **Recommendation**: Based on the evidence, what's the suggested path? Be explicit about confidence level.

## Phase 5: Write Report

Write the report to `docs/research/{YYYY-MM-DD}-{slug}.md` using this template:

```markdown
---
type: research
title: "{Title}"
subject: "{subject}"
date: { YYYY-MM-DD }
confidence: { high|medium|low }
verdict: { adopt|trial|assess|hold|reject }
---

# {Title}

> One-line summary of the finding.

## TL;DR

3-5 bullet executive summary covering: what it is, key finding, recommendation.

## What This Is

Brief neutral description of the subject being researched.

## State of the Art (2026)

Current best practices, latest developments, where the ecosystem stands today.
Cite sources inline as [Source Name](url).

## Positive Signals

Evidence-backed reasons in favor. Group by theme.
Each point should cite its source and note credibility level.

### {Theme 1}

- ...

### {Theme 2}

- ...

## Negative Signals

Evidence-backed criticism and risks. Group by theme.
Each point should cite its source and note credibility level.

### {Theme 1}

- ...

### {Theme 2}

- ...

## Community Sentiment

What practitioners actually say. Include direct quotes where available.
Note the balance: if sentiment skews one way, say so explicitly.

## Project Alignment

### Vision Fit

How this relates to the project's current goals.

### Tech Stack Fit

Integration with the project's stack (from `package.json`, framework configs).

### Trade-offs for Current Stage

What matters most given where the project is now.

## Recommendation

Clear recommendation with confidence level and reasoning.
Include conditions under which the recommendation would change.

## Sources

Numbered list of all sources used, with:

- [N] [Title](url) — type, credibility, sentiment direction
```

## Phase 6: Present Summary

After writing the file, present to the user:

1. The output file path
2. The verdict and confidence
3. A 3-line summary of the key finding
4. Any critical gaps or caveats

</Steps>

<Quality_Gates>

- Minimum 8 distinct sources cited
- At least 2 sources per major claim
- Both positive AND negative signals sections must be substantive (not token)
- Sources section must include credibility and sentiment annotations
- Vision alignment section must reference specific project goals (not generic)
- All inline citations must be clickable links
- Frontmatter must include confidence and verdict fields
  </Quality_Gates>

<Verdict_Scale>

- **adopt**: Strong evidence, clear fit, community consensus positive. Use it.
- **trial**: Promising evidence, worth a bounded experiment. Try it in a limited scope.
- **assess**: Mixed signals or insufficient evidence. Research more before committing.
- **hold**: Significant concerns or poor fit. Don't invest now, revisit later.
- **reject**: Clear evidence against. Don't use this.
  </Verdict_Scale>

<Tool_Usage>

- `WebSearch` for broad discovery (Phase 1) and gap-filling (Phase 3)
- `WebFetch` for deep source extraction (Phase 2)
- `Read` for loading vision and tech stack context (Phase 0)
- `Write` for the final report (Phase 5)
- `Agent` with `subagent_type=Explore` if codebase context is needed for alignment analysis
- Use parallel tool calls wherever searches are independent
  </Tool_Usage>

<Common_Mistakes>

- Writing a report that's all positive or all negative — always find both sides
- Citing marketing material as if it were neutral evidence — flag vendor bias
- Making alignment claims without reading the actual vision doc
- Using stale search results — always include "2026" in queries
- Writing the report before triangulating — don't just concatenate search results
  </Common_Mistakes>

Task: {{ARGUMENTS}}
