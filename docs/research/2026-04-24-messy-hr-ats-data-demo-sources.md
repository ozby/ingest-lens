---
type: research
title: "Messy HR and ATS data examples for IngestLens"
subject: "Realistic public HR/ATS data phenomena for an integration-platform portfolio demo"
date: "2026-04-24"
last_updated: "2026-04-24"
confidence: high
verdict: trial
---

# Messy HR and ATS data examples for IngestLens

> Best demo data: start with public ATS job postings because they are public,
> deterministic, richly messy, and directly useful for an integration-platform
> showcase; use synthetic HRIS employee updates only for privacy-safe adversarial
> tests.

## TL;DR

- Public ATS job data is realistic enough for a first IngestLens demo: it has
  HTML descriptions, vendor-specific field names, location ambiguity,
  compensation variance, custom questions, compliance blocks, and source URLs.
- The checked-in `open-apply-jobs` sample is a good deterministic base, but the
  current pinned fixture set is too sanitized to fully demonstrate messiness; it
  should be enriched with representative fields before the public demo ships.
- HRIS employee data is messier, but public employee payloads are usually either
  synthetic or private. Keep HRIS examples synthetic until a clearly public and
  privacy-safe source exists.
- The strongest compact demo is: **location normalization + compensation
  normalization + custom questions + compliance/privacy separation + explicit
  source provenance**.

## What This Is

This research identifies public, realistic data patterns that make IngestLens
worth building. The goal is not to scrape private candidate or employee records;
it is to pick a safe data slice that still shows why integration platforms need
normalization, observability, and human-approved mapping.

## State of the Art (2026)

The public ATS ecosystem exposes job postings through documented, unauthenticated
or low-friction public endpoints. Greenhouse says Job Board GET endpoints are
public, and its job detail response can include rich content, departments,
offices, application questions, location questions, demographic questions,
compliance data, and pay transparency ranges when requested
([Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html)).
Lever's postings API exposes JSON and HTML modes; records include styled HTML,
plain text, lists, workplace type, salary range, salary description, hosted URL,
and apply URL ([Lever Postings API](https://github.com/lever/postings-api)).
Ashby's public postings API exposes location, secondary locations, department,
team, remote/workplace type, HTML/plain descriptions, employment type, apply URL,
and optional compensation details; it also notes missing source fields remain
missing in API output ([Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)).

The `open-apply-jobs` dataset aggregates active public postings from Greenhouse,
Lever, and Ashby into daily full snapshots with source provenance, HTML
presence, employment type, department, locations, remote signal, salary bounds,
and source IDs ([open-apply-jobs](https://huggingface.co/datasets/edwarddgao/open-apply-jobs)).
The dataset's full-snapshot design is useful for deterministic demos but should
not be framed as a webhook/event stream.

For HRIS-style data, public docs show why private employee records are messy but
not ideal as a public demo source. SAP SuccessFactors documents custom fields,
conditional omissions, and ignored custom field data types in its Compound
Employee API ([SAP custom fields](https://help.sap.com/docs/successfactors-employee-central/employee-central-compound-employee-api/extending-api-with-custom-fields)).
BambooHR field-based webhooks can post changed field names and selected current
fields, with customizable field names and JSON or form-post encodings
([BambooHR field-based webhooks](https://documentation.bamboohr.com/docs/field-based-webhooks)).
Google's job posting structured-data docs provide another useful normalization
benchmark for job location, applicant location requirements, employment type, and
base salary ([Google JobPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting)).

## Positive Signals

### Public ATS postings are safe and relevant

- Public job board APIs are designed to power career pages, making them safer
  than private candidate or employee records for a public showcase
  ([Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html),
  [Lever Postings API](https://github.com/lever/postings-api),
  [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)).
- `open-apply-jobs` is daily refreshed, includes Greenhouse/Lever/Ashby source
  provenance, and already exists as a pinned fixture source in this repo
  ([open-apply-jobs](https://huggingface.co/datasets/edwarddgao/open-apply-jobs)).

### The data is genuinely messy

- Rich HTML exists across providers: Greenhouse `content`, Lever styled HTML
  fields/lists, and Ashby `descriptionHtml` all create sanitization and
  section-extraction work.
- Compensation is inconsistent: Greenhouse exposes pay input ranges via a query
  option, Lever has structured salary range plus styled descriptions, and Ashby
  has optional compensation tiers/summaries.
- Location is not a single scalar: Greenhouse exposes location questions and
  offices; Lever has categories plus all locations and workplace type; Ashby has
  primary and secondary locations plus remote/workplace fields.

### The domain demonstrates product value quickly

- A reviewer can understand job-posting normalization without seeing private
  data.
- Mapping uncertainty is visible: source fields are absent, renamed, nested,
  optional, repeated, or mixed with prose.
- Observability has a clear story: prompt latency, validation error, operator
  approval, normalized event emission, delivery retry, and replay all map to
  product value.

## Negative Signals

### Public job postings are not full HRIS data

Public ATS postings avoid private candidate/employee PII, which is a feature for
a portfolio demo, but they do not exercise the hardest employee-record problems:
effective dating, manager hierarchy drift, benefit/payroll state, and country-
specific data models.

### Current checked-in fixture sample is too clean

The current pinned JSONL sample retains only a small subset of fields. It covers
provider naming differences, but it does not yet include the full messy set that
would make the AI mapper shine: rich HTML, compensation ranges, multi-location
ambiguity, questions, compliance blocks, or raw provider metadata.

### Live public fetch can distract

Live fetches can add freshness but also introduce flakes, rate limits, schema
changes, and network failures. IngestLens should make pinned fixtures the default
path and treat live fetch as a disabled-by-default enhancement.

## Community Sentiment

Public practitioner sentiment around ATS job data is pragmatic: developers build
job aggregators from public Greenhouse/Lever/Ashby endpoints because the data is
public and useful, but they still have to handle deduplication, stale postings,
location filters, source URLs, and inconsistent fields. That supports a bounded
IngestLens demo, not a broad scraping product.

## Candidate messy-data phenomena

| Phenomenon                              | Public source signal                                                                                                 | Demo use                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Rich HTML descriptions                  | Greenhouse `content`, Lever `description`/`lists`, Ashby `descriptionHtml`                                           | Show HTML sanitization, summary extraction, and no raw telemetry leakage.                       |
| Vendor field-name drift                 | Ashby `title`, Lever `text`, Greenhouse `title`; `apply_url` vs `applyUrl` style differences in derived fixtures     | Let AI suggest target paths while local validation enforces source-path existence.              |
| Multi-location ambiguity                | Lever `allLocations`, Ashby `secondaryLocations`, Greenhouse offices/location questions                              | Normalize to `locations[]`, `remote_policy`, and `jurisdiction_notes`.                          |
| Remote/hybrid mismatch                  | Lever `workplaceType`, Ashby `isRemote` and `workplaceType`, prose descriptions                                      | Show model uncertainty when structured and prose signals disagree.                              |
| Compensation variance                   | Greenhouse pay ranges, Lever salary range/description, Ashby compensation tiers                                      | Normalize salary min/max/currency/period and preserve unparsed text.                            |
| Department/team/office hierarchy        | Greenhouse departments/offices with parent-child structures; Ashby department/team; Lever team/department categories | Map hierarchy into canonical `department`, `team`, and `source_hierarchy`.                      |
| Custom application questions            | Greenhouse questions and Lever application forms                                                                     | Demonstrate dynamic fields, required flags, answer options, and branching validation.           |
| Compliance/demographic/privacy sections | Greenhouse demographic/data-compliance structures; public forms often separate self-ID content                       | Prove sensitive fields are separated from normalized job/delivery telemetry.                    |
| Application and source URLs             | Greenhouse absolute URLs, Lever hosted/apply URLs, Ashby job/apply URLs                                              | Preserve provenance and link normalized events back to source records.                          |
| Snapshot semantics                      | `open-apply-jobs` daily full snapshots                                                                               | Teach the demo to say “snapshot” and avoid pretending the data is an event stream.              |
| HRIS custom fields                      | SAP custom fields and BambooHR aliases/field-based webhooks                                                          | Keep as synthetic/adversarial tests for custom-field mapping without exposing employee records. |
| Batched webhook updates                 | BambooHR field-based webhooks can include employee arrays and changed/current field sets                             | Good future fixture for event freshness and drift repair.                                       |

## Project Alignment

### Vision Fit

This fits IngestLens directly: messy public ATS payloads are the safest realistic
input for the core loop of intake, mapping suggestion, approval, normalized event
emission, and observability proof.

### Tech Stack Fit

- **Workers/Hono:** can expose fixture catalog and mapping-suggestion routes.
- **Cloudflare Workers AI:** can provide suggestion-only mapping with local
  validation and deterministic fallback.
- **Postgres/Drizzle:** can store mapping attempts, approvals, validation errors,
  and normalized event provenance.
- **Queues/Durable Objects/Analytics Engine:** can demonstrate delivery,
  retry/replay, and mapping lifecycle telemetry.
- **React:** can render source payload, suggestion diff, validation errors,
  confidence, and approval controls.

### Trade-offs for Current Stage

| Choice                          | Verdict     | Reason                                                                              |
| ------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| Public ATS postings             | Adopt first | Public, realistic, deterministic, already represented in repo fixtures.             |
| Enriched pinned fixture set     | Adopt       | Necessary to make the demo visibly messy without live dependencies.                 |
| Live public fetch               | Trial later | Useful wow factor after deterministic path works; risky as default.                 |
| Synthetic HRIS employee updates | Keep        | Good adversarial tests; not public-demo default because employee data is sensitive. |
| Candidate applications          | Hold        | Richly messy but includes PII/compliance risk; use form schemas, not submissions.   |

## Recommendation

Adopt public ATS job-posting fixtures as the canonical messy demo source, but
expand the pinned sample before demo polish. The fixture pack should include at
least one record each for rich HTML, salary range/currency, multi-location,
remote/hybrid ambiguity, custom questions, compliance/privacy separation, and
provider-specific hierarchy fields.

Confidence is high because this recommendation is supported by official provider
docs, an existing public dataset, and current repo assets. It should change only
if the project obtains a clearly public, privacy-safe HRIS employee dataset with
explicit redistribution permission.

## Sources

1. [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html) — official docs, high credibility, positive and risk signal.
2. [Lever Postings API](https://github.com/lever/postings-api) — official docs, high credibility, positive and risk signal.
3. [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api) — official docs, high credibility, positive and risk signal.
4. [open-apply-jobs](https://huggingface.co/datasets/edwarddgao/open-apply-jobs) — public dataset, medium-high credibility, positive signal.
5. [Google JobPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting) — official docs, high credibility, normalization benchmark.
6. [SAP SuccessFactors custom fields](https://help.sap.com/docs/successfactors-employee-central/employee-central-compound-employee-api/extending-api-with-custom-fields) — official docs, high credibility, HRIS custom-field risk signal.
7. [SAP SuccessFactors common HRIS fields](https://help.sap.com/docs/successfactors-platform/sap-successfactors-hcm-suite-sfapi-developer-guide/common-fields-in-hris-integration) — official docs, high credibility, HRIS field-model signal.
8. [BambooHR field-based webhooks](https://documentation.bamboohr.com/docs/field-based-webhooks) — official docs, high credibility, webhook/custom-field signal.
9. [BambooHR permissioned webhooks](https://documentation.bamboohr.com/docs/permissioned-webhooks) — official docs, high credibility, batching/permissioning signal.
10. [Greenhouse pay transparency support](https://support.greenhouse.io/hc/en-us/articles/10028084062491-Add-pay-transparency-to-a-job-post) — vendor support docs, medium-high credibility, compensation complexity signal.
