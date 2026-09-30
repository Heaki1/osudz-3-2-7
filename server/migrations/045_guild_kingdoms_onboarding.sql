-- Guild onboarding, kingdom residency, isolated Guild boards, and travel state.

ALTER TABLE user_guild_profiles
  ADD COLUMN IF NOT EXISTS adventurer_name text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kingdom text,
  ADD COLUMN IF NOT EXISTS travel_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS travel_arrives_at timestamptz,
  ADD COLUMN IF NOT EXISTS travel_destination text,
  ADD COLUMN IF NOT EXISTS kingdom_cooldown_until timestamptz;

ALTER TABLE user_guild_profiles
  DROP CONSTRAINT IF EXISTS user_guild_profiles_kingdom_valid;
ALTER TABLE user_guild_profiles
  ADD CONSTRAINT user_guild_profiles_kingdom_valid
  CHECK (kingdom IS NULL OR kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM'));

ALTER TABLE user_guild_profiles
  DROP CONSTRAINT IF EXISTS user_guild_profiles_adventurer_name_valid;
ALTER TABLE user_guild_profiles
  ADD CONSTRAINT user_guild_profiles_adventurer_name_valid
  CHECK (adventurer_name IS NULL OR char_length(btrim(adventurer_name)) BETWEEN 2 AND 32);

CREATE UNIQUE INDEX IF NOT EXISTS user_guild_profiles_adventurer_name_lower_idx
  ON user_guild_profiles (lower(adventurer_name))
  WHERE adventurer_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS guild_kingdoms (
  kingdom text PRIMARY KEY,
  display_name text NOT NULL,
  capital text NOT NULL,
  lore text NOT NULL,
  travel_cost_dzp integer NOT NULL DEFAULT 500,
  travel_duration_hours integer NOT NULL DEFAULT 8,
  cooldown_months integer NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT guild_kingdoms_key_valid CHECK (kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM')),
  CONSTRAINT guild_kingdoms_cost_valid CHECK (travel_cost_dzp >= 0),
  CONSTRAINT guild_kingdoms_duration_valid CHECK (travel_duration_hours = 8),
  CONSTRAINT guild_kingdoms_cooldown_valid CHECK (cooldown_months = 2)
);

INSERT INTO guild_kingdoms (kingdom, display_name, capital, lore)
VALUES
  ('RE_ESTIZE', 'Re-Estize Kingdom', 'Re-Estize', 'The classic adventurer hub. Bounties here hold high traditional prestige, and the Guild operates freely as a respected mercenary force.'),
  ('BAHARUTH', 'Baharuth Empire', 'Arwintar', 'A militaristic state ruled by the Blood Emperor. Imperial Knights handle monster subjugations, so Guild adventurers operate more like Workers on dirty, unregulated, or ruin-exploration jobs.'),
  ('SORCERER_KINGDOM', 'The Sorcerer Kingdom', 'E-Rantel', 'A centralized powerhouse ruled by Ainz Ooal Gown. Traditional hunting is obsolete under perfect undead order; the Guild serves as a funded, strictly regulated exploration front.'),
  ('ROBLE_HOLY_KINGDOM', 'Roble Holy Kingdom', 'Holy Kingdom', 'An isolated nation behind a massive Great Wall. Paladin Orders and Priests carry the main defense while Guild adventurers provide secondary support when the holy warriors are stretched thin.')
ON CONFLICT (kingdom) DO UPDATE SET display_name = EXCLUDED.display_name, capital = EXCLUDED.capital, lore = EXCLUDED.lore;

ALTER TABLE beatmap_hunts
  ADD COLUMN IF NOT EXISTS kingdom text NOT NULL DEFAULT 'RE_ESTIZE';

ALTER TABLE beatmap_hunts
  DROP CONSTRAINT IF EXISTS beatmap_hunts_kingdom_valid;
ALTER TABLE beatmap_hunts
  ADD CONSTRAINT beatmap_hunts_kingdom_valid
  CHECK (kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM'));

CREATE INDEX IF NOT EXISTS beatmap_hunts_kingdom_status
  ON beatmap_hunts (kingdom, status, created_at DESC);

CREATE TABLE IF NOT EXISTS guild_travel_events (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_kingdom text NOT NULL,
  to_kingdom text NOT NULL,
  cost_dzp integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  arrives_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'IN_TRANSIT',
  CONSTRAINT guild_travel_events_kingdom_valid CHECK (from_kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM') AND to_kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM')),
  CONSTRAINT guild_travel_events_different_valid CHECK (from_kingdom <> to_kingdom),
  CONSTRAINT guild_travel_events_status_valid CHECK (status IN ('IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT guild_travel_events_cost_valid CHECK (cost_dzp >= 0)
);

CREATE INDEX IF NOT EXISTS guild_travel_events_user_started
  ON guild_travel_events (user_id, started_at DESC);

ALTER TABLE dzp_ledger
  DROP CONSTRAINT dzp_ledger_transaction_type_valid;
ALTER TABLE dzp_ledger
  ADD CONSTRAINT dzp_ledger_transaction_type_valid
  CHECK (transaction_type IN ('challenge_reward','challenge_reward_adjustment','purchase','steal_purchase','steal_compensation','refund','admin_adjustment','guild_hunt_escrow','guild_hunt_payout','guild_hunt_refund','guild_loan_funding','guild_loan_repayment','guild_exam_reward','guild_travel'));
