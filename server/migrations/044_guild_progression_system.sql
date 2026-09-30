-- 044_guild_progression_system.sql
-- Canonical Guild EXP economy, hard rank thresholds, gate definitions,
-- 24-hour demotion grace state, family-gate resets, and Adamantite review.

ALTER TABLE guild_rank_definitions
  ADD COLUMN IF NOT EXISTS gate_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE guild_rank_definitions
SET
  min_exp = CASE rank
    WHEN 'IRON' THEN 0
    WHEN 'COPPER' THEN 300
    WHEN 'SILVER' THEN 1000
    WHEN 'GOLD' THEN 2500
    WHEN 'PLATINUM' THEN 6000
    WHEN 'MITHRIL' THEN 12000
    WHEN 'ORICHALCUM' THEN 25000
    WHEN 'ADAMANTITE' THEN 50000
  END,
  gate_requirements = CASE rank
    WHEN 'IRON' THEN '{}'::jsonb
    WHEN 'COPPER' THEN '{"beatmapChallengeQualified":3}'::jsonb
    WHEN 'SILVER' THEN '{"targetQualified":2}'::jsonb
    WHEN 'GOLD' THEN '{"advancedQualifiedStreak":5}'::jsonb
    WHEN 'PLATINUM' THEN '{"beginner":{"targetCount":2,"challengeCount":2,"challengeTop3":1},"advanced":{"targetCount":4,"beatMyScoreCount":2,"snipeScoreCount":2,"challengeCount":2,"challengeFirst":1,"challengeTop3":1,"challengeTop5":1}}'::jsonb
    WHEN 'MITHRIL' THEN '{"eliteStrictQualified":3}'::jsonb
    WHEN 'ORICHALCUM' THEN '{"advanced":{"targetCount":3,"challengeCount":2,"challengeFirst":1},"elite":{"targetCount":4,"beatMyScoreCount":2,"snipeScoreCount":2,"challengeCount":3,"challengeFirst":1}}'::jsonb
    WHEN 'ADAMANTITE' THEN '{"legendaryTargetWins":3,"legendaryUnbeatenBeatMyScoreExpiry":1,"manualReview":true}'::jsonb
  END,
  required_hunt_tier = NULL,
  required_successes = NULL,
  updated_at = now();

ALTER TABLE user_guild_profiles
  ADD COLUMN IF NOT EXISTS demotion_warning_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS demotion_target_rank text,
  ADD COLUMN IF NOT EXISTS family_gate_reset_at timestamptz;

ALTER TABLE user_guild_profiles
  DROP CONSTRAINT IF EXISTS user_guild_profiles_demotion_target_rank_valid;

ALTER TABLE user_guild_profiles
  ADD CONSTRAINT user_guild_profiles_demotion_target_rank_valid
  CHECK (demotion_target_rank IS NULL OR demotion_target_rank IN (
    'IRON', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'MITHRIL', 'ORICHALCUM', 'ADAMANTITE'
  ));

CREATE INDEX IF NOT EXISTS user_guild_profiles_demotion_warning_idx
  ON user_guild_profiles (demotion_warning_started_at)
  WHERE demotion_warning_started_at IS NOT NULL;

ALTER TABLE guild_exp_events
  ADD COLUMN IF NOT EXISTS base_exp integer,
  ADD COLUMN IF NOT EXISTS rank_multiplier numeric(4,2),
  ADD COLUMN IF NOT EXISTS rank_at_event text,
  ADD COLUMN IF NOT EXISTS event_type text;

CREATE TABLE IF NOT EXISTS guild_rank_reviews (
  id           uuid PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_rank text NOT NULL,
  status       text NOT NULL DEFAULT 'PENDING_REVIEW',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by  integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  note         text,

  CONSTRAINT guild_rank_reviews_rank_valid
    CHECK (requested_rank IN ('ORICHALCUM', 'ADAMANTITE')),
  CONSTRAINT guild_rank_reviews_status_valid
    CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS guild_rank_reviews_one_pending_per_user
  ON guild_rank_reviews (user_id)
  WHERE status = 'PENDING_REVIEW';

CREATE INDEX IF NOT EXISTS guild_rank_reviews_status_idx
  ON guild_rank_reviews (status, requested_at DESC);
