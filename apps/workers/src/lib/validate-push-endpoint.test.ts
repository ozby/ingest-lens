import { describe, expect, it } from "vitest";
import { validatePushEndpoint } from "./validate-push-endpoint";

describe("validatePushEndpoint", () => {
  it("accepts a valid https URL", () => {
    expect(validatePushEndpoint("https://attacker.com/hook")).toEqual({ valid: true });
  });

  it("accepts an https URL with a path and query", () => {
    expect(validatePushEndpoint("https://hooks.example.com/delivery?key=abc")).toEqual({
      valid: true,
    });
  });

  it("rejects http scheme", () => {
    const result = validatePushEndpoint("http://attacker.com/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/https/);
  });

  it("rejects ftp scheme", () => {
    const result = validatePushEndpoint("ftp://attacker.com/hook");
    expect(result.valid).toBe(false);
  });

  it("rejects a bare non-URL string", () => {
    const result = validatePushEndpoint("not-a-url");
    expect(result.valid).toBe(false);
  });

  it("rejects localhost", () => {
    const result = validatePushEndpoint("https://localhost/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("localhost");
  });

  it("rejects *.local hostnames", () => {
    const result = validatePushEndpoint("https://my-machine.local/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/\.local/);
  });

  it("rejects metadata.google.internal", () => {
    const result = validatePushEndpoint("https://metadata.google.internal/computeMetadata/v1/");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/metadata\.google\.internal/);
  });

  it("rejects link-local IP 169.254.169.254", () => {
    const result = validatePushEndpoint("https://169.254.169.254/latest/meta-data/");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/link-local/);
  });

  it("rejects loopback IP 127.0.0.1", () => {
    const result = validatePushEndpoint("https://127.0.0.1/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/loopback/);
  });

  it("rejects private IP 10.x.x.x", () => {
    const result = validatePushEndpoint("https://10.0.0.1/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/private/);
  });

  it("rejects private IP 172.16.x.x", () => {
    const result = validatePushEndpoint("https://172.16.0.1/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/private/);
  });

  it("rejects private IP 172.31.x.x", () => {
    const result = validatePushEndpoint("https://172.31.255.255/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/private/);
  });

  it("accepts 172.15.x.x (just outside 172.16/12 range)", () => {
    expect(validatePushEndpoint("https://172.15.0.1/hook")).toEqual({ valid: true });
  });

  it("rejects private IP 192.168.x.x", () => {
    const result = validatePushEndpoint("https://192.168.1.1/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/private/);
  });

  it("rejects multicast IP 224.0.0.1", () => {
    const result = validatePushEndpoint("https://224.0.0.1/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/multicast/);
  });

  it("rejects multicast IP 239.255.255.255", () => {
    const result = validatePushEndpoint("https://239.255.255.255/hook");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/multicast/);
  });

  it("accepts a public IP address", () => {
    expect(validatePushEndpoint("https://8.8.8.8/hook")).toEqual({ valid: true });
  });
});
