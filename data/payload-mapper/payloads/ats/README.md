# ATS Payload Samples (Public Demo Lens)

This directory contains a **pinned**, curated subset of public ATS job-posting
payloads derived from the
[open-apply-jobs](https://huggingface.co/datasets/edwarddgao/open-apply-jobs)
public dataset.

## Files

| File                      | Source                                     | Records | Purpose                                     |
| ------------------------- | ------------------------------------------ | ------- | ------------------------------------------- |
| `open-apply-sample.jsonl` | open-apply-jobs (Ashby, Greenhouse, Lever) | 8       | Source payloads for mapping-task generation |

## Design choices

- Only columns required for mapping tasks are retained: `title`/`name`/`text`, `apply_url`/`applyUrl`,
  `employment_type`, `department`/`team`, `locations`/`location`, `status`/`state`.
- Payloads are stored in the `payload-record.schema.json` envelope format.
- The sample is intentionally small and deterministic.
- It is the canonical pinned fixture source for public-dataset demo ingestion.
- Demo runtime should use a bundled version of this file; no runtime filesystem
  reads or arbitrary public-URL scraping are required in v1.
- The open-apply-jobs dataset is a **daily full snapshot**, not an event stream — use it for
  offline task generation and reproducible demo fixtures.

## Coverage

- Ashby: 4 postings (including multi-location Remote example)
- Greenhouse: 2 postings (department and office object shapes)
- Lever: 2 postings (text/team/applyUrl field naming differences)
