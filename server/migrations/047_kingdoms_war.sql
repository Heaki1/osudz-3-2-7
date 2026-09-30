-- Kingdoms War / Mascara cycle.
-- War state is isolated from ordinary Guild hunts so war attempts never create
-- normal hunt penalties or EXP events.

ALTER TABLE user_guild_profiles
  ADD COLUMN IF NOT EXISTS kingdom text;

ALTER TABLE user_guild_profiles
  DROP CONSTRAINT IF EXISTS user_guild_profiles_kingdom_valid;

ALTER TABLE user_guild_profiles
  ADD CONSTRAINT user_guild_profiles_kingdom_valid
  CHECK (kingdom IS NULL OR kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER', 'ROBLE'));

CREATE INDEX IF NOT EXISTS user_guild_profiles_kingdom_rank_idx
  ON user_guild_profiles (kingdom, guild_rank, guild_exp DESC, user_id)
  WHERE registration_status = 'ACTIVE' AND kingdom IS NOT NULL;

CREATE TABLE guild_war_cycles (
  id uuid PRIMARY KEY,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'REGISTRATION',
  postponed_reason text,
  revealed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guild_war_cycles_dates_valid CHECK (ends_at = starts_at + interval '20 days'),
  CONSTRAINT guild_war_cycles_status_valid CHECK (status IN ('REGISTRATION','TRUMP','REVIEW','REVEAL','MASCARA','POSTPONED','COMPLETED'))
);

CREATE INDEX guild_war_cycles_start_idx ON guild_war_cycles (starts_at DESC);

CREATE TABLE guild_war_participants (
  cycle_id uuid NOT NULL REFERENCES guild_war_cycles(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kingdom text NOT NULL,
  roster_rank integer NOT NULL,
  guild_rank text NOT NULL,
  guild_exp integer NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (cycle_id, user_id),
  CONSTRAINT guild_war_participants_kingdom_valid CHECK (kingdom IN ('RE_ESTIZE','BAHARUTH','SORCERER','ROBLE')),
  CONSTRAINT guild_war_participants_roster_rank_valid CHECK (roster_rank BETWEEN 1 AND 3)
);

CREATE UNIQUE INDEX guild_war_participants_roster_slot
  ON guild_war_participants (cycle_id, kingdom, roster_rank);

CREATE TABLE guild_war_trump_cards (
  id uuid PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES guild_war_cycles(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kingdom text NOT NULL,
  beatmap_id bigint NOT NULL,
  beatmapset_id bigint,
  difficulty_id bigint NOT NULL,
  mod_requirement text NOT NULL DEFAULT 'FM',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'SUBMITTED',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  CONSTRAINT guild_war_trump_cards_status_valid CHECK (status IN ('SUBMITTED','APPROVED','REJECTED')),
  CONSTRAINT guild_war_trump_cards_kingdom_valid CHECK (kingdom IN ('RE_ESTIZE','BAHARUTH','SORCERER','ROBLE')),
  UNIQUE (cycle_id, user_id)
);

CREATE INDEX guild_war_trump_cards_review_idx ON guild_war_trump_cards (cycle_id, status, submitted_at);

CREATE TABLE guild_war_maps (
  id uuid PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES guild_war_cycles(id) ON DELETE CASCADE,
  slot integer NOT NULL,
  source text NOT NULL,
  kingdom text,
  difficulty_id bigint NOT NULL,
  beatmap_id bigint NOT NULL,
  beatmapset_id bigint,
  mod_requirement text NOT NULL DEFAULT 'FM',
  challenge_requirement jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guild_war_maps_slot_valid CHECK (slot BETWEEN 1 AND 10),
  CONSTRAINT guild_war_maps_source_valid CHECK (source IN ('PLAYER','VIP')),
  CONSTRAINT guild_war_maps_player_kingdom_valid CHECK ((source = 'PLAYER' AND kingdom IS NOT NULL) OR (source = 'VIP' AND kingdom IS NULL)),
  UNIQUE (cycle_id, slot)
);

CREATE TABLE guild_war_quests (
  id uuid PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES guild_war_cycles(id) ON DELETE CASCADE,
  map_id uuid NOT NULL UNIQUE REFERENCES guild_war_maps(id) ON DELETE CASCADE,
  quest_number integer NOT NULL,
  no_penalty boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guild_war_quests_number_valid CHECK (quest_number BETWEEN 1 AND 10),
  UNIQUE (cycle_id, quest_number)
);

CREATE TABLE guild_war_attempts (
  id uuid PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES guild_war_cycles(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES guild_war_quests(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  osu_score_id bigint NOT NULL,
  score bigint NOT NULL,
  accuracy numeric(7,4) NOT NULL,
  max_combo integer NOT NULL,
  misses integer NOT NULL,
  mods text NOT NULL,
  pp numeric(8,2),
  passed boolean NOT NULL,
  category text NOT NULL,
  placement integer,
  war_score integer NOT NULL DEFAULT 0,
  ended_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quest_id, user_id),
  UNIQUE (quest_id, osu_score_id),
  CONSTRAINT guild_war_attempts_category_valid CHECK (category IN ('QUALIFIED','ATTEMPT')),
  CONSTRAINT guild_war_attempts_score_valid CHECK (score >= 0 AND accuracy >= 0 AND accuracy <= 100 AND max_combo >= 0 AND misses >= 0),
  CONSTRAINT guild_war_attempts_placement_valid CHECK (placement IS NULL OR placement > 0)
);

CREATE INDEX guild_war_attempts_leaderboard_idx
  ON guild_war_attempts (quest_id, category, score DESC, accuracy DESC, user_id);

CREATE TABLE guild_war_placement_bonuses (
  placement integer PRIMARY KEY,
  bonus integer NOT NULL CHECK (bonus >= 0)
);

INSERT INTO guild_war_placement_bonuses (placement, bonus) VALUES
  (1,10000),(2,7000),(3,5000),(4,4000),(5,3000),(6,2500),(7,2000),(8,1500),
  (9,1000),(10,750),(11,500),(12,250)
ON CONFLICT (placement) DO NOTHING;

CREATE INDEX guild_war_participants_kingdom_idx ON guild_war_participants (cycle_id, kingdom, roster_rank);
