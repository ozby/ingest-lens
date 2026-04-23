---
type: research
title: "Human-in-the-loop and LLM-as-judge use case for IngestLens"
subject: "How IngestLens should use HITL, LLM judging, and approval/replay tooling for HR/ATS integration data"
date: "2026-04-24"
last_updated: "2026-04-24"
confidence: high
verdict: accepted
---

# Human-in-the-loop and LLM-as-judge use case for IngestLens

> 2026-04-24 refinement: this report originally evaluated the HR/ATS example
> case. The canonical product framing is now generic self-healing ingestion;
> HR/ATS remains the first demo lens. See
> [Self-healing data ingestion architecture for IngestLens](./2026-04-24-self-healing-data-ingestion-architecture.md).

## TL;DR

The strongest use case is **adaptive ingestion mapping review with an admin
approval and replay console**. The system should not score candidates, rank
people, or make employment decisions. It should help integration operators turn
messy ATS/HRIS-shaped payloads into reviewed, versioned, replayable normalized
events.

Recommended product loop:

```text
messy third-party payload
  -> drift detection
  -> AI proposes mapping repair + uncertainty
  -> deterministic validators check source paths and schema
  -> admin reviews pending suggestion in an approval panel
  -> approval replays source payload through approved mapping
  -> system ingests ingest.record.normalized.v1 through existing delivery rails
  -> trace shows AI suggestion, human decision, replay, ingest, delivery, retry
```

LLM-as-judge is useful, but only as **offline review/eval assistance**. It should
not be the production approver. In production, deterministic checks and a human
admin are the gate.

## Why this is the right showcase use case

### 1. HR AI is sensitive; avoid employment-decision automation

The EU AI Act treats many employment and worker-management AI systems as
high-risk and requires human oversight for high-risk systems. EUR-Lex publishes
Regulation (EU) 2024/1689 and describes required documentation around AI-system
capabilities, limitations, risks, and human oversight measures. NYC's Automated
Employment Decision Tool rule similarly targets automated tools used in hiring
and requires bias audits and notices before use.

That makes candidate ranking, CV screening, hiring recommendations, or employee
performance scoring a bad portfolio wedge: it pulls the project into bias,
explainability, labor-law, and fairness claims that are far larger than the repo.

A mapping-review control plane is safer and still highly relevant. It operates on
integration data quality, not people decisions. The admin approves a data mapping,
not a person.

### 2. Human-in-the-loop is not decoration; it is the product

NIST AI RMF frames trustworthy AI around governance, mapping, measurement, and
management of risk; its core resources explicitly include defining and
documenting human oversight processes. For IngestLens, HITL should be concrete:
there is a pending queue, a named approver, a reject path, an audit trail, and a
replay result.

The admin panel should therefore be the hero feature, not a secondary detail.

### 3. LLM-as-judge is a useful reviewer, not a source of truth

LLM-as-judge research is mixed. MT-Bench/Chatbot Arena showed LLM judges can
track human preferences well enough to be useful at scale, and G-Eval showed
improved human alignment for NLG evaluation. But newer empirical studies find
reliability varies materially with criteria, task, domain, sampling, and judge
design. JUDGE-BENCH reports substantial variability across tasks and models, and
bias studies show both human and LLM judges can be vulnerable to systematic
judgement biases.

So the right design is:

- deterministic validators for hard facts: JSON validity, schema validity,
  source-path existence, payload size/depth, owner scope, event shape;
- human admin approval for production state transition;
- optional LLM judge for offline explanation quality, ambiguity critique, and
  eval triage;
- never LLM judge as the only production approval gate.

## Recommended IngestLens use case

### Name

**Adaptive Mapping Review & Replay Console**

### User

Integration operator / implementation engineer responsible for connecting messy
ATS/HRIS payloads to a normalized event contract.

### Job to be done

> When a new vendor payload is messy or ambiguous, I need the system to suggest a
> mapping, show exactly what is uncertain, let me approve or reject it, and then
> replay the original payload through the approved mapping so I can prove the
> normalized event was ingested and delivered.

### Core workflow

1. Operator selects a public ATS fixture or submits a JSON payload.
2. AI proposes mapping candidates, missing fields, ambiguous fields, and a
   confidence summary.
3. Deterministic validators reject hallucinated paths and invalid target shapes.
4. Admin panel shows pending suggestions with source preview, provenance,
   confidence, validation errors, and target queue/topic.
5. Admin approves or rejects.
6. Approval triggers deterministic replay using the approved mapping.
7. Replay ingests `ingest.record.normalized.v1` into existing delivery rails.
8. Trace view shows `mappingTraceId` across AI suggestion, validation, admin
   decision, replay, ingest, delivery, retry, and replayable state.

## Useful tooling to build

### Must-have for showcase readiness

| Tooling                              | Why it matters                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Admin approval queue                 | Makes HITL real: pending, approved, rejected, expired, ingested.                     |
| Suggestion detail view               | Shows mapping diff, missing fields, ambiguous fields, confidence, validation errors. |
| Deterministic replay + ingest button | Proves approval causes a real platform state transition without another AI call.     |
| Mapping trace timeline               | Shows prompt version, model id, validation, admin action, replay, ingest, delivery.  |
| Redacted source preview              | Lets admins review payloads without unsafe raw HTML or long legal text leakage.      |
| Mapping version / schema version     | Makes approved mappings replayable and explainable over time.                        |
| Reject-with-reason                   | Builds an auditable negative path instead of only happy-path approval.               |
| Expiry handling                      | Pasted raw payloads should expire; pinned fixtures can be reconstructed by id/hash.  |

### Nice-to-have after core flow

| Tooling               | Use                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| LLM judge eval report | Offline critique of suggestion quality against rubric; flags likely bad suggestions for human review. |
| Batch review mode     | Approve/reject multiple fixture suggestions after deterministic validation.                           |
| Drift detector        | Re-run approved mapping against a newer public fixture and flag schema drift.                         |
| Compare vendors view  | Show Ashby/Greenhouse/Lever field-shape differences side by side.                                     |
| Policy checklist      | Show why this is integration-data tooling, not employment decision automation.                        |

## Where LLM-as-judge fits

Use LLM-as-judge in three bounded places:

1. **Offline eval triage** — score explanation quality, ambiguity handling, and
   whether a suggestion seems suspicious. This augments deterministic metrics.
2. **Admin assist** — generate a short critique for the admin: "why this mapping
   may be risky." It is advisory copy, not a decision.
3. **Regression review** — compare old/new prompt versions on pinned fixtures and
   summarize likely behavior changes before a human reviews the diff.

Do not use LLM-as-judge for:

- automatic approval;
- candidate/employee scoring;
- replacing deterministic schema/source-path validation;
- legal compliance claims;
- deciding whether to ingest.

## Architecture implication

The product should be framed as an **AI control plane for integration data**:

- AI proposes.
- Deterministic validators verify hard facts.
- Human admin approves.
- Deterministic replay ingests.
- Telemetry proves the lifecycle.

This is more defensible and more useful than a generic "AI maps fields" demo, and it is now framed as a domain-neutral ingestion system with HR/ATS as one demo lens.
It also uses the existing queue/topic delivery infrastructure as proof instead
of treating it as an unrelated legacy assignment.

## Sources

- [EU AI Act, Regulation (EU) 2024/1689, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [EU AI Act Article 14 human oversight text mirror](https://artificialintelligenceact.eu/article/14/)
- [NYC Automated Employment Decision Tools rule](https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685)
- [G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment](https://aclanthology.org/2023.emnlp-main.153/)
- [LLMs instead of Human Judges? JUDGE-BENCH](https://arxiv.org/abs/2406.18403)
- [Humans or LLMs as the Judge? A Study on Judgement Bias](https://aclanthology.org/2024.emnlp-main.474/)
- [Cloudflare Workers AI JSON Mode](https://developers.cloudflare.com/workers-ai/json-mode/)
