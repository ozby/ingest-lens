import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("harness gate suite manifest declares deterministic held-in and held-out suites", () => {
  assert.equal(
    readFileSync("harness-gate/suites.yaml", "utf8"),
    `version: 1
consumer: ingest-lens
suites:
  - id: ingest-lens.agent-setup-smoke
    tier: held-in
    command: wp setup --check
    surfaces:
      - generated-agent-surfaces
      - codex-hooks
      - claude-hooks
    proof: validates that generated agent surfaces and hook install checks remain consumable in ingest-lens
  - id: ingest-lens.e2e-smoke
    tier: held-in
    command: wp e2e --suite smoke
    surfaces:
      - harness-regression-gate
    proof: validates baseline Playwright smoke wiring through the wp e2e adapter
  - id: ingest-lens.client-shell-e2e
    tier: held-out
    command: wp e2e --suite client-shell
    surfaces:
      - harness-regression-gate
      - generated-agent-surfaces
    proof: validates a deeper client shell journey before release-ready harness verdicts
`,
  );
});
