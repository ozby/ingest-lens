import { describe, it, expect } from "vitest";
import { InMemoryArchive, makeArchiveRow } from "./events-archive";
import { fixMessageDelivered, fixRunCompleted } from "../test-fixtures/events";

describe("InMemoryArchive", () => {
  it("inserts and retrieves rows", async () => {
    const archive = new InMemoryArchive();
    const row = makeArchiveRow(fixMessageDelivered, 1, new Date("2026-01-01"));
    await archive.insert(row);
    const rows = await archive.queryFrom("session-abc", "");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventId).toBe("evt-002");
  });

  it("queryFrom returns events after lastEventId", async () => {
    const archive = new InMemoryArchive();
    const r1 = makeArchiveRow(fixMessageDelivered, 1, new Date("2026-01-01"));
    const r2 = makeArchiveRow(fixRunCompleted, 2, new Date("2026-01-01"));
    await archive.insert(r1);
    await archive.insert(r2);
    const rows = await archive.queryFrom("session-abc", "evt-002");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventId).toBe("evt-006");
  });

  it("returns empty when session has no rows", async () => {
    const archive = new InMemoryArchive();
    const rows = await archive.queryFrom("nonexistent-session", "");
    expect(rows).toHaveLength(0);
  });

  it("returns all rows when afterEventId not found", async () => {
    const archive = new InMemoryArchive();
    const r1 = makeArchiveRow(fixMessageDelivered, 1, new Date("2026-01-01"));
    await archive.insert(r1);
    const rows = await archive.queryFrom("session-abc", "nonexistent-event-id");
    expect(rows).toHaveLength(1);
  });

  it("returns rows in monotonic sequence order", async () => {
    const archive = new InMemoryArchive();
    const r2 = makeArchiveRow(fixRunCompleted, 2, new Date("2026-01-01"));
    const r1 = makeArchiveRow(fixMessageDelivered, 1, new Date("2026-01-01"));
    await archive.insert(r2); // inserted out of order
    await archive.insert(r1);
    const rows = await archive.queryFrom("session-abc", "");
    expect(rows[0]?.seq).toBe(1);
    expect(rows[1]?.seq).toBe(2);
  });
});

describe("makeArchiveRow", () => {
  it("creates a row with correct fields", () => {
    const row = makeArchiveRow(fixMessageDelivered, 5, new Date("2026-01-01"));
    expect(row.sessionId).toBe("session-abc");
    expect(row.eventId).toBe("evt-002");
    expect(row.seq).toBe(5);
    expect(row.eventType).toBe("message_delivered");
    expect(row.createdAt).toEqual(new Date("2026-01-01"));
    expect(JSON.parse(row.payload)).toMatchObject({ type: "message_delivered" });
  });
});
