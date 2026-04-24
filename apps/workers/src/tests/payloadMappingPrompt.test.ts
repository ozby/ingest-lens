import { describe, expect, it } from "vitest";
import { buildMappingPrompt, DEFAULT_MAPPING_PROMPT_VERSION } from "../intake/aiMappingAdapter";
import { getFixtureReference, getTargetContract } from "../intake/contracts";

describe("payload mapping prompt contract", () => {
  it.each(["ashby-job-001", "greenhouse-job-001", "lever-posting-001"])(
    "includes abstention guidance for %s",
    (fixtureId) => {
      const fixture = getFixtureReference(fixtureId);
      const contract = getTargetContract("job-posting-v1");

      if (!fixture || !contract) {
        throw new Error("Expected fixture and contract to exist");
      }

      const prompt = buildMappingPrompt({
        payload: fixture.payload,
        sourceSystem: fixture.sourceSystem,
        contractId: contract.id,
        contractVersion: contract.version,
        promptVersion: DEFAULT_MAPPING_PROMPT_VERSION,
        targetFields: contract.targetFields,
      });

      expect(prompt).toContain("Abstain instead of inventing fields");
      expect(prompt).toContain(`Prompt version: ${DEFAULT_MAPPING_PROMPT_VERSION}`);
      expect(prompt).toContain(`Contract: ${contract.id}@${contract.version}`);
      expect(prompt).toContain(`Source system: ${fixture.sourceSystem}`);
    },
  );
});
