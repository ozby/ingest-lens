import { describe, expect, it } from "vitest";
import { getDemoFixtureById, listDemoFixtures } from "../intake/demoFixtures";

describe("demoFixtures", () => {
  it("lists pinned public fixture metadata without payload bodies", () => {
    const fixtures = listDemoFixtures();

    expect(fixtures).toHaveLength(8);
    expect(fixtures[0]).toEqual({
      id: "ashby-job-001",
      sourceSystem: "ashby",
      sourceUrl: "https://huggingface.co/datasets/edwarddgao/open-apply-jobs",
      contractHint: "job-posting-v1",
      summary: "Staff Software Engineer, Backend",
    });
    expect(fixtures[0]).not.toHaveProperty("payload");
  });

  it("returns a validated fixture payload by id", () => {
    expect(getDemoFixtureById("greenhouse-job-001")).toMatchObject({
      id: "greenhouse-job-001",
      sourceSystem: "greenhouse",
      contractHint: "job-posting-v1",
      payload: {
        name: "Senior Data Engineer",
      },
    });
  });

  it("returns undefined for unknown fixture ids", () => {
    expect(getDemoFixtureById("missing-fixture")).toBeUndefined();
  });

  it("keeps the generated module aligned with the pinned jsonl envelope", () => {
    for (const fixture of listDemoFixtures()) {
      const detail = getDemoFixtureById(fixture.id);

      expect(detail).toBeDefined();
      expect(detail?.sourceSystem).toBe(fixture.sourceSystem);
      expect(detail?.sourceUrl).toBe(fixture.sourceUrl);
      expect(detail?.contractHint).toBe("job-posting-v1");
      expect(detail?.payload).toBeTypeOf("object");
    }
  });
});
