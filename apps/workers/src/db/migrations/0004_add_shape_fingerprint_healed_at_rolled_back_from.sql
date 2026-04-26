ALTER TABLE approved_mapping_revisions ADD COLUMN IF NOT EXISTS shape_fingerprint text;
ALTER TABLE approved_mapping_revisions ADD COLUMN IF NOT EXISTS healed_at timestamp;
ALTER TABLE approved_mapping_revisions ADD COLUMN IF NOT EXISTS rolled_back_from text;
