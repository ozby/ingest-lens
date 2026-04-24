import { describe, expect, it } from "vitest";
import type { AxiosResponse } from "axios";
import type { ApiResponse } from "@repo/types";
import { extractData } from "./api";

interface TestPayload {
  id: string;
  value: number;
}

function buildResponse<T>(data: ApiResponse<T> | undefined): AxiosResponse<ApiResponse<T>> {
  return {
    data: data as ApiResponse<T>,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} as AxiosResponse["config"]["headers"] },
  } as AxiosResponse<ApiResponse<T>>;
}

describe("extractData", () => {
  it("returns the unwrapped data on a success envelope", () => {
    const payload: TestPayload = { id: "abc", value: 42 };
    const response = buildResponse<TestPayload>({
      status: "success",
      data: payload,
    });

    const result = extractData(response);

    expect(result).toEqual(payload);
  });

  it("throws with a recognisable message when status is not success", () => {
    const response = buildResponse<TestPayload>({
      status: "error",
      data: { id: "abc", value: 0 },
    });

    expect(() => extractData(response)).toThrow(
      'API response envelope status is "error", expected "success"',
    );
  });

  it("throws when the envelope is missing entirely", () => {
    const response = buildResponse<TestPayload>(undefined);

    expect(() => extractData(response)).toThrow("API response envelope is missing");
  });
});
