-- Tear-down migration: 0002_teardown_lab_schema
-- Drops the entire lab schema in one atomic statement.
-- WARNING: This is a manual ritual — do NOT automate in CI.
-- Run only when intentionally decommissioning the lab environment.
-- Requires superuser or DROP privilege on the lab schema.

DROP SCHEMA IF EXISTS lab CASCADE;
