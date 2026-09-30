-- Persist the 12-hour Kingdoms War score-sync claim so the interval remains
-- globally throttled across API instances and process restarts.
ALTER TABLE guild_war_cycles
  ADD COLUMN IF NOT EXISTS last_score_sync_at timestamptz;
