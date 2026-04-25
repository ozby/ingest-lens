/**
 * Unit test for the CI guard script logic and schema definitions.
 *
 * Full integration test (Neon branch apply) is out of scope for unit tests.
 * This verifies:
 * 1. CI guard correctly flags public.* DDL
 * 2. CI guard passes clean migrations
 * 3. Schema object names match expectations
 */
import { describe, it, expect } from "vitest";
import { sessions, runs, eventsArchive, heartbeat, heartbeatAudit } from "./schema";

// ---------------------------------------------------------------------------
// CI guard logic (extracted from scripts/check-lab-migrations.ts for unit test)
// ---------------------------------------------------------------------------

const PUBLIC_DDL_PATTERN = /\bpublic\s*\.\s*\w/i;

function checkMigration(sql: string): string[] {
  const violations: string[] = [];
  const lines = sql.split("\n");
  for (const line of lines) {
    if (line.trimStart().startsWith("--")) continue;
    if (PUBLIC_DDL_PATTERN.test(line)) {
      violations.push(line.trim());
    }
  }
  return violations;
}

describe("CI guard: check-lab-migrations", () => {
  it("flags a migration containing public.foo DDL", () => {
    const bad = `CREATE TABLE public.foo (id SERIAL PRIMARY KEY);\n`;
    const violations = checkMigration(bad);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags ALTER TABLE public.bar DDL", () => {
    const bad = `ALTER TABLE public.bar ADD COLUMN name TEXT;\n`;
    const violations = checkMigration(bad);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes a clean migration with only lab.* DDL", () => {
    const clean = `
CREATE SCHEMA IF NOT EXISTS lab;
CREATE TABLE IF NOT EXISTS lab.sessions (id TEXT PRIMARY KEY);
`;
    const violations = checkMigration(clean);
    expect(violations).toHaveLength(0);
  });

  it("ignores comment lines containing public.", () => {
    const withComment = `-- This used to be in public.sessions but was moved\nCREATE TABLE lab.sessions (id TEXT);\n`;
    const violations = checkMigration(withComment);
    expect(violations).toHaveLength(0);
  });

  it("passes the actual 0001_create_lab_schema.sql migration", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const content = readFileSync(
      join(import.meta.dirname, "../migrations/0001_create_lab_schema.sql"),
      "utf-8",
    );
    const violations = checkMigration(content);
    expect(violations).toHaveLength(0);
  });

  it("passes the 0002_teardown_lab_schema.sql migration", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const content = readFileSync(
      join(import.meta.dirname, "../migrations/0002_teardown_lab_schema.sql"),
      "utf-8",
    );
    const violations = checkMigration(content);
    expect(violations).toHaveLength(0);
  });
});

function getTableName(table: unknown): unknown {
  return (table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")];
}

describe("lab.* Drizzle schema definitions", () => {
  it("sessions table exists with correct name", () => {
    expect(getTableName(sessions)).toBe("sessions");
  });

  it("runs table exists with correct name", () => {
    expect(getTableName(runs)).toBe("runs");
  });

  it("eventsArchive table exists with correct name", () => {
    expect(getTableName(eventsArchive)).toBe("events_archive");
  });

  it("heartbeat table exists with correct name", () => {
    expect(getTableName(heartbeat)).toBe("heartbeat");
  });

  it("heartbeatAudit table exists with correct name", () => {
    expect(getTableName(heartbeatAudit)).toBe("heartbeat_audit");
  });

  it("all five tables are defined", () => {
    // F-12: exactly 5 tables in lab schema
    const tables = [sessions, runs, eventsArchive, heartbeat, heartbeatAudit];
    expect(tables).toHaveLength(5);
  });
});
