# PRD: Execute all planned blueprints with parallel lanes

## Goal

Implement all active planned blueprints in this repository with safe parallelism, preserving blueprint dependency order, and produce one verified commit per blueprint.

## In scope

- `showcase-hardening-100`
- `client-route-code-splitting`
- `rebrand-ingestlens`
- `ai-oss-tooling-adapter`
- `ai-payload-intake-mapper`
- `public-dataset-demo-ingestion`

## Constraints

- Verification is mandatory after each blueprint (`$verify` equivalent evidence).
- Keep dependency chain intact.
- Shared-file conflicts must be serialized.
- One commit per blueprint.

## Execution model

1. Foundation wave: `showcase-hardening-100` and `client-route-code-splitting`
2. Branding wave: `rebrand-ingestlens`
3. AI platform wave: `ai-oss-tooling-adapter`
4. Intake feature wave: `ai-payload-intake-mapper`
5. Demo wave: `public-dataset-demo-ingestion`

## Success criteria

- Every active planned blueprint has implementation changes matching its blueprint goals.
- Every blueprint has fresh verification evidence before commit.
- Repo remains green at final integrated verification.
