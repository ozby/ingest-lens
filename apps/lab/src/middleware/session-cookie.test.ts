import { describe, it, expect } from "vitest";
import { buildCookieValue, parseCookieValue, newSessionId } from "./session-cookie";

const SECRET_A = "lab-session-secret-a";
const SECRET_B = "jwt-secret-b"; // simulates JWT_SECRET — must NOT work

describe("buildCookieValue / parseCookieValue", () => {
  it("round-trips: signed value parses correctly with correct secret", async () => {
    const sid = newSessionId();
    const value = await buildCookieValue(sid, SECRET_A);
    const result = await parseCookieValue(value, SECRET_A);
    expect(result).toBe(sid);
  });

  it("rejects cookie signed with a different secret (JWT_SECRET must not work)", async () => {
    const sid = newSessionId();
    const value = await buildCookieValue(sid, SECRET_A);
    const result = await parseCookieValue(value, SECRET_B);
    expect(result).toBeNull();
  });

  it("rejects cookie with tampered sessionId", async () => {
    const sid = newSessionId();
    const value = await buildCookieValue(sid, SECRET_A);
    const tampered = `tampered-session-id.${value.split(".").at(-1) ?? ""}`;
    const result = await parseCookieValue(tampered, SECRET_A);
    expect(result).toBeNull();
  });

  it("rejects cookie with tampered signature", async () => {
    const sid = newSessionId();
    const value = await buildCookieValue(sid, SECRET_A);
    const parts = value.split(".");
    // replace last char of sig
    const sig = parts.at(-1) ?? "";
    const tamperedSig = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
    const tampered = `${parts.slice(0, -1).join(".")}.${tamperedSig}`;
    const result = await parseCookieValue(tampered, SECRET_A);
    expect(result).toBeNull();
  });

  it("rejects cookie with no dot separator", async () => {
    const result = await parseCookieValue("nodotpresent", SECRET_A);
    expect(result).toBeNull();
  });
});

describe("newSessionId", () => {
  it("generates unique UUIDs", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newSessionId()));
    expect(ids.size).toBe(20);
  });
});
