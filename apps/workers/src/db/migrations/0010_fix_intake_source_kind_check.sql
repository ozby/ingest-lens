ALTER TABLE intake_attempts
  DROP CONSTRAINT IF EXISTS intake_attempts_source_kind_check;

ALTER TABLE intake_attempts
  ADD CONSTRAINT intake_attempts_source_kind_check
  CHECK (source_kind IN ('inline_payload', 'fixture_reference'));
