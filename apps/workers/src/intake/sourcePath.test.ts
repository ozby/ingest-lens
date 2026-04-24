import { describe, expect, it } from "vitest";
import { parseSourcePath, resolveSourcePath } from "./sourcePath";

const samplePayload = {
  company: {
    name: "IngestLens",
  },
  location: {
    city: "Berlin",
  },
  description: "Self-healing delivery rails.",
  locations: [
    {
      city: "Berlin",
      country: "DE",
    },
  ],
  nullableField: null,
} as const;

describe("sourcePath", () => {
  it("resolves allowed object paths", () => {
    expect(resolveSourcePath(samplePayload, "/company/name")).toEqual({
      ok: true,
      path: "/company/name",
      segments: ["company", "name"],
      value: "IngestLens",
    });

    expect(resolveSourcePath(samplePayload, "/location/city")).toEqual({
      ok: true,
      path: "/location/city",
      segments: ["location", "city"],
      value: "Berlin",
    });

    expect(resolveSourcePath(samplePayload, "/description")).toEqual({
      ok: true,
      path: "/description",
      segments: ["description"],
      value: "Self-healing delivery rails.",
    });
  });

  it("supports concrete array indexes and nullable values", () => {
    expect(resolveSourcePath(samplePayload, "/locations/0/city")).toEqual({
      ok: true,
      path: "/locations/0/city",
      segments: ["locations", "0", "city"],
      value: "Berlin",
    });

    expect(resolveSourcePath(samplePayload, "/nullableField")).toEqual({
      ok: true,
      path: "/nullableField",
      segments: ["nullableField"],
      value: null,
    });
  });

  it("rejects reserved prototype-pollution keys", () => {
    expect(parseSourcePath("/company/__proto__")).toEqual({
      ok: false,
      code: "forbidden_segment",
      path: "/company/__proto__",
      segment: "__proto__",
      message: "Source paths cannot access reserved key '__proto__'.",
    });

    expect(parseSourcePath("/company/constructor")).toEqual({
      ok: false,
      code: "forbidden_segment",
      path: "/company/constructor",
      segment: "constructor",
      message: "Source paths cannot access reserved key 'constructor'.",
    });
  });

  it("rejects empty segments and relative syntax", () => {
    expect(parseSourcePath("/company//name")).toEqual({
      ok: false,
      code: "invalid_syntax",
      path: "/company//name",
      message: "Source paths cannot contain empty path segments.",
    });

    expect(parseSourcePath("company/name")).toEqual({
      ok: false,
      code: "invalid_syntax",
      path: "company/name",
      message: "Source paths must start with '/'.",
    });

    expect(parseSourcePath("/../company/name")).toEqual({
      ok: false,
      code: "unsupported_traversal",
      path: "/../company/name",
      segment: "..",
      message: "Source paths cannot use traversal syntax '..'.",
    });
  });

  it("rejects wildcard and array-wide traversal", () => {
    expect(parseSourcePath("/locations/*/city")).toEqual({
      ok: false,
      code: "unsupported_traversal",
      path: "/locations/*/city",
      segment: "*",
      message: "Source paths cannot use traversal syntax '*'.",
    });

    expect(parseSourcePath("/locations/-/city")).toEqual({
      ok: false,
      code: "unsupported_traversal",
      path: "/locations/-/city",
      segment: "-",
      message: "Source paths cannot use traversal syntax '-'.",
    });
  });

  it("rejects paths outside the current payload", () => {
    expect(resolveSourcePath(samplePayload, "/company/missing")).toEqual({
      ok: false,
      code: "missing_value",
      path: "/company/missing",
      segment: "missing",
      message: "Segment 'missing' is outside the current payload.",
    });

    expect(resolveSourcePath(samplePayload, "/locations/2/city")).toEqual({
      ok: false,
      code: "missing_value",
      path: "/locations/2/city",
      segment: "2",
      message: "Array index '2' is outside the current payload.",
    });
  });
});
