# Test Spec: Execute all planned blueprints with parallel lanes

## Verification policy

Per blueprint, run the narrowest sufficient verification first, then the blueprint-level gates, then a repo-level confidence check when the surface is broad.

## Blueprint verification expectations

- `showcase-hardening-100`: targeted workers/client tests, lint/typecheck for touched packages, CI/audit checks when relevant.
- `client-route-code-splitting`: client tests, client typecheck, client build, bundle gate verification.
- `rebrand-ingestlens`: docs checks, client tests/build for touched UI shell/pages, blueprint/docs checks.
- `ai-oss-tooling-adapter`: worker tests for adapter/schema/path logic, worker typecheck.
- `ai-payload-intake-mapper`: worker+client tests for intake flow, relevant typecheck/build checks.
- `public-dataset-demo-ingestion`: docs checks plus worker/client tests for fixture/demo flow.

## Commit gate

Before each blueprint commit:

1. Inspect diff.
2. Run `$verify`-equivalent checks for that blueprint.
3. Confirm zero blocking failures.
4. Commit exactly once for that blueprint.

## Final regression

Run repo-wide checks appropriate to the integrated change set before concluding the Ralph session.
