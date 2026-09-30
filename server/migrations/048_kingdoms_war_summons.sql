-- War Summons access is temporary and expires two days after the 20-day cycle.
ALTER TABLE guild_war_participants
  ADD COLUMN IF NOT EXISTS summoned_at timestamptz,
  ADD COLUMN IF NOT EXISTS summons_expires_at timestamptz;
