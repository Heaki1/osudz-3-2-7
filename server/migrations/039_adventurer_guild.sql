-- 039_adventurer_guild.sql
--
-- Adventurer Guild + Beatmap Hunts.
--
-- This migration is intentionally independent from the Duel domain. Hunts, Guild
-- progression, placement exams, loans and reports have their own tables and lifecycle.
-- Do not add BEGIN/COMMIT: the migration runner wraps each file in one transaction.

-- ── DZP ledger extensions ─────────────────────────────────────────────────────

ALTER TABLE dzp_ledger
  DROP CONSTRAINT dzp_ledger_transaction_type_valid;

ALTER TABLE dzp_ledger
  ADD CONSTRAINT dzp_ledger_transaction_type_valid
  CHECK (
    transaction_type IN (
      'challenge_reward',
      'challenge_reward_adjustment',
      'purchase',
      'steal_purchase',
      'steal_compensation',
      'refund',
      'admin_adjustment',
      'guild_hunt_escrow',
      'guild_hunt_payout',
      'guild_hunt_refund',
      'guild_loan_funding',
      'guild_loan_repayment',
      'guild_exam_reward'
    )
  );

-- ── Guild rank definitions ────────────────────────────────────────────────────
--
-- The rank names are fixed by the Guild concept. Advancement thresholds are
-- deliberately nullable: the user has deferred the final progression formula.
-- Admins can configure those values later without a schema change.

CREATE TABLE guild_rank_definitions (
  rank                 text PRIMARY KEY,
  rank_order            integer NOT NULL UNIQUE,
  family                text NOT NULL,
  badge_asset           text NOT NULL,
  min_exp               integer,
  required_hunt_tier    text,
  required_successes    integer,
  is_active             boolean NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT guild_rank_definitions_rank_valid
    CHECK (rank IN (
      'IRON', 'COPPER', 'SILVER', 'GOLD',
      'PLATINUM', 'MITHRIL', 'ORICHALCUM', 'ADAMANTITE'
    )),
  CONSTRAINT guild_rank_definitions_family_valid
    CHECK (family IN ('BEGINNER', 'ADVANCED', 'ELITE', 'LEGENDARY_MASTER')),
  CONSTRAINT guild_rank_definitions_min_exp_valid
    CHECK (min_exp IS NULL OR min_exp >= 0),
  CONSTRAINT guild_rank_definitions_required_successes_valid
    CHECK (required_successes IS NULL OR required_successes >= 0),
  CONSTRAINT guild_rank_definitions_required_hunt_tier_valid
    CHECK (required_hunt_tier IS NULL OR required_hunt_tier IN ('BEGINNER', 'ADVANCED', 'ELITE', 'LEGENDARY_MASTER'))
);

INSERT INTO guild_rank_definitions (rank, rank_order, family, badge_asset)
VALUES
  ('IRON',       1, 'BEGINNER',        '/guild/badges/iron.svg'),
  ('COPPER',     2, 'BEGINNER',        '/guild/badges/copper.svg'),
  ('SILVER',     3, 'ADVANCED',        '/guild/badges/silver.svg'),
  ('GOLD',       4, 'ADVANCED',        '/guild/badges/gold.svg'),
  ('PLATINUM',   5, 'ELITE',           '/guild/badges/platinum.svg'),
  ('MITHRIL',    6, 'ELITE',           '/guild/badges/mithril.svg'),
  ('ORICHALCUM', 7, 'LEGENDARY_MASTER','/guild/badges/orichalcum.svg'),
  ('ADAMANTITE', 8, 'LEGENDARY_MASTER','/guild/badges/adamantite.svg')
ON CONFLICT (rank) DO NOTHING;

-- ── Auto-classification policy ────────────────────────────────────────────────
--
-- A hunt starts in the highest tier whose minimum star rating AND minimum bounty
-- are both satisfied. This makes bounty meaningful without allowing money alone
-- to turn a trivial beatmap into a Legendary Master quest. Administration can
-- override the result at any time.

CREATE TABLE guild_hunt_tier_rules (
  tier             text PRIMARY KEY,
  tier_order       integer NOT NULL UNIQUE,
  display_name     text NOT NULL,
  min_stars        numeric(4,2) NOT NULL,
  min_bounty_dzp   integer NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT guild_hunt_tier_rules_tier_valid
    CHECK (tier IN ('BEGINNER', 'ADVANCED', 'ELITE', 'LEGENDARY_MASTER')),
  CONSTRAINT guild_hunt_tier_rules_stars_valid
    CHECK (min_stars >= 0),
  CONSTRAINT guild_hunt_tier_rules_bounty_valid
    CHECK (min_bounty_dzp >= 100)
);

INSERT INTO guild_hunt_tier_rules (tier, tier_order, display_name, min_stars, min_bounty_dzp)
VALUES
  ('BEGINNER',         1, 'Beginner',        0.00, 100),
  ('ADVANCED',         2, 'Advanced',        5.00, 250),
  ('ELITE',            3, 'Elite / Mithril', 7.00, 1000),
  ('LEGENDARY_MASTER', 4, 'Legendary Master', 8.50, 5000)
ON CONFLICT (tier) DO NOTHING;

-- ── Player Guild profile ──────────────────────────────────────────────────────

CREATE TABLE user_guild_profiles (
  user_id               integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  registration_status   text NOT NULL DEFAULT 'UNREGISTERED',
  guild_rank            text NOT NULL DEFAULT 'IRON',
  guild_exp             integer NOT NULL DEFAULT 0,
  attempted_hunts       integer NOT NULL DEFAULT 0,
  successful_hunts      integer NOT NULL DEFAULT 0,
  failed_hunts          integer NOT NULL DEFAULT 0,
  exam_used             boolean NOT NULL DEFAULT false,
  registered_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_guild_profiles_status_valid
    CHECK (registration_status IN ('UNREGISTERED', 'ACTIVE')),
  CONSTRAINT user_guild_profiles_rank_valid
    CHECK (guild_rank IN (
      'IRON', 'COPPER', 'SILVER', 'GOLD',
      'PLATINUM', 'MITHRIL', 'ORICHALCUM', 'ADAMANTITE'
    )),
  CONSTRAINT user_guild_profiles_exp_valid
    CHECK (guild_exp >= 0),
  CONSTRAINT user_guild_profiles_attempts_valid
    CHECK (attempted_hunts >= 0 AND successful_hunts >= 0 AND failed_hunts >= 0)
);

CREATE INDEX user_guild_profiles_rank_idx
  ON user_guild_profiles (guild_rank, guild_exp DESC);

-- ── Guild EXP audit ───────────────────────────────────────────────────────────

CREATE TABLE guild_exp_events (
  id                 bigserial PRIMARY KEY,
  user_id            integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hunt_id            uuid,
  attempt_id         uuid,
  delta_exp          integer NOT NULL,
  reason             text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guild_exp_events_user_created
  ON guild_exp_events (user_id, created_at DESC, id DESC);

CREATE INDEX guild_exp_events_hunt
  ON guild_exp_events (hunt_id);

-- ── Guild notifications ───────────────────────────────────────────────────────

CREATE TABLE guild_notifications (
  id          bigserial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guild_notifications_user_created
  ON guild_notifications (user_id, created_at DESC, id DESC);

CREATE INDEX guild_notifications_unread
  ON guild_notifications (user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

-- ── Beatmap Hunts ─────────────────────────────────────────────────────────────

CREATE TABLE beatmap_hunts (
  id                    uuid PRIMARY KEY,
  poster_user_id        integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hunt_type             text NOT NULL,
  status                text NOT NULL DEFAULT 'ACTIVE',
  auto_tier             text NOT NULL,
  admin_tier            text,
  beatmap_id            bigint NOT NULL,
  beatmapset_id         bigint NOT NULL,
  title                 text NOT NULL,
  artist                text NOT NULL,
  mapper                text NOT NULL,
  difficulty_name       text NOT NULL,
  cover_url             text,
  preview_url           text,
  stars                 numeric(4,2) NOT NULL,
  cs                    numeric(3,1),
  ar                    numeric(3,1),
  od                    numeric(3,1),
  hp                    numeric(3,1),
  max_combo             integer,
  bounty_dzp            integer NOT NULL,
  escrowed_dzp          integer NOT NULL DEFAULT 0,
  requirements          jsonb NOT NULL DEFAULT '{}'::jsonb,
  description           text NOT NULL DEFAULT '',
  target_score_id       bigint,
  target_score_user_id  bigint,
  target_score_data     jsonb,
  admin_override_reason text,
  upgrade_required_dzp  integer NOT NULL DEFAULT 0,
  expires_at             timestamptz NOT NULL,
  published_at          timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  winner_user_id        integer REFERENCES users(id) ON DELETE SET NULL,
  winner_attempt_id     uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT beatmap_hunts_type_valid
    CHECK (hunt_type IN ('BEAT_MY_SCORE', 'SNIPE_SCORE', 'BEATMAP_CHALLENGE')),
  CONSTRAINT beatmap_hunts_status_valid
    CHECK (status IN ('ACTIVE', 'PENDING_UPGRADE', 'CLAIMED', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT beatmap_hunts_auto_tier_valid
    CHECK (auto_tier IN ('BEGINNER', 'ADVANCED', 'ELITE', 'LEGENDARY_MASTER')),
  CONSTRAINT beatmap_hunts_admin_tier_valid
    CHECK (admin_tier IS NULL OR admin_tier IN ('BEGINNER', 'ADVANCED', 'ELITE', 'LEGENDARY_MASTER')),
  CONSTRAINT beatmap_hunts_bounty_valid
    CHECK (bounty_dzp >= 100 AND escrowed_dzp >= 0),
  CONSTRAINT beatmap_hunts_stars_valid
    CHECK (stars >= 0),
  CONSTRAINT beatmap_hunts_upgrade_valid
    CHECK (upgrade_required_dzp >= 0),
  CONSTRAINT beatmap_hunts_target_type_valid
    CHECK (
      (hunt_type = 'BEATMAP_CHALLENGE' AND target_score_id IS NULL AND target_score_data IS NULL)
      OR
      (hunt_type IN ('BEAT_MY_SCORE', 'SNIPE_SCORE') AND target_score_id IS NOT NULL AND target_score_data IS NOT NULL)
    )
);

CREATE INDEX beatmap_hunts_active_tier
  ON beatmap_hunts (
    COALESCE(admin_tier, auto_tier),
    created_at DESC,
    id
  )
  WHERE status IN ('ACTIVE', 'PENDING_UPGRADE');

CREATE INDEX beatmap_hunts_claimed_tier
  ON beatmap_hunts (
    COALESCE(admin_tier, auto_tier),
    completed_at DESC,
    id
  )
  WHERE status = 'CLAIMED';

CREATE INDEX beatmap_hunts_expiry
  ON beatmap_hunts (expires_at)
  WHERE status = 'ACTIVE';

CREATE INDEX beatmap_hunts_poster
  ON beatmap_hunts (poster_user_id, created_at DESC);

-- ── Hunt attempts / leaderboard ────────────────────────────────────────────────

CREATE TABLE beatmap_hunt_attempts (
  id                uuid PRIMARY KEY,
  hunt_id           uuid NOT NULL REFERENCES beatmap_hunts(id) ON DELETE CASCADE,
  user_id           integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  osu_score_id      bigint NOT NULL,
  score             bigint NOT NULL,
  accuracy          numeric(7,4) NOT NULL,
  max_combo         integer NOT NULL,
  misses            integer NOT NULL,
  mods              text NOT NULL,
  pp                numeric(8,2),
  passed            boolean NOT NULL DEFAULT true,
  qualifies        boolean NOT NULL,
  failure_reason    text,
  penalty_reason    text,
  guild_exp_delta   integer NOT NULL DEFAULT 0,
  final_placement   integer,
  deleted_at        timestamptz,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT beatmap_hunt_attempts_score_valid
    CHECK (score >= 0 AND accuracy >= 0 AND accuracy <= 100 AND max_combo >= 0 AND misses >= 0),
  CONSTRAINT beatmap_hunt_attempts_placement_valid
    CHECK (final_placement IS NULL OR final_placement > 0),
  CONSTRAINT beatmap_hunt_attempts_score_unique
    UNIQUE (hunt_id, osu_score_id)
);

CREATE INDEX beatmap_hunt_attempts_leaderboard
  ON beatmap_hunt_attempts (hunt_id, qualifies DESC, score DESC, accuracy DESC, submitted_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX beatmap_hunt_attempts_user
  ON beatmap_hunt_attempts (user_id, submitted_at DESC);

ALTER TABLE beatmap_hunts
  ADD CONSTRAINT beatmap_hunts_winner_attempt_fk
  FOREIGN KEY (winner_attempt_id)
  REFERENCES beatmap_hunt_attempts(id)
  ON DELETE SET NULL;

-- ── Hunt administration audit ─────────────────────────────────────────────────

CREATE TABLE guild_hunt_admin_actions (
  id                  bigserial PRIMARY KEY,
  hunt_id             uuid NOT NULL REFERENCES beatmap_hunts(id) ON DELETE CASCADE,
  admin_user_id       integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action              text NOT NULL,
  previous_tier       text,
  new_tier            text,
  required_top_up_dzp integer NOT NULL DEFAULT 0,
  reason              text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guild_hunt_admin_actions_hunt
  ON guild_hunt_admin_actions (hunt_id, created_at DESC);

-- ── Smurf / moderation reports ─────────────────────────────────────────────────

CREATE TABLE hunt_reports (
  id                uuid PRIMARY KEY,
  attempt_id        uuid NOT NULL REFERENCES beatmap_hunt_attempts(id) ON DELETE CASCADE,
  reporter_user_id  integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason            text NOT NULL,
  status            text NOT NULL DEFAULT 'PENDING',
  resolved_by       integer REFERENCES users(id) ON DELETE SET NULL,
  resolution_note   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,

  CONSTRAINT hunt_reports_status_valid
    CHECK (status IN ('PENDING', 'RESOLVED_BANNED', 'RESOLVED_CLEARED')),
  CONSTRAINT hunt_reports_unique_report
    UNIQUE (attempt_id, reporter_user_id)
);

CREATE INDEX hunt_reports_pending
  ON hunt_reports (created_at DESC)
  WHERE status = 'PENDING';

-- ── Guild loans ────────────────────────────────────────────────────────────────

CREATE TABLE guild_loans (
  id                       uuid PRIMARY KEY,
  user_id                  integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hunt_id                  uuid REFERENCES beatmap_hunts(id) ON DELETE SET NULL,
  principal_dzp             integer NOT NULL,
  remaining_dzp             integer NOT NULL,
  installment_percent       integer NOT NULL DEFAULT 25,
  status                    text NOT NULL DEFAULT 'ACTIVE',
  issued_at                 timestamptz NOT NULL DEFAULT now(),
  due_at                    timestamptz NOT NULL,
  last_repayment_at         timestamptz,
  paid_at                   timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT guild_loans_amounts_valid
    CHECK (principal_dzp > 0 AND remaining_dzp >= 0 AND remaining_dzp <= principal_dzp),
  CONSTRAINT guild_loans_installment_valid
    CHECK (installment_percent BETWEEN 1 AND 100),
  CONSTRAINT guild_loans_status_valid
    CHECK (status IN ('ACTIVE', 'PAID', 'DEFAULTED'))
);

CREATE UNIQUE INDEX guild_loans_one_active_per_user
  ON guild_loans (user_id)
  WHERE status = 'ACTIVE';

CREATE INDEX guild_loans_due
  ON guild_loans (due_at, status);

-- ── Placement exam templates ──────────────────────────────────────────────────

CREATE TABLE guild_placement_exam_templates (
  test_number       integer PRIMARY KEY,
  difficulty_id     bigint NOT NULL,
  requirements      jsonb NOT NULL,
  reward_rank       text,
  reward_dzp        integer NOT NULL DEFAULT 0,
  enabled           boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT guild_placement_exam_templates_number_valid
    CHECK (test_number BETWEEN 1 AND 6),
  CONSTRAINT guild_placement_exam_templates_reward_rank_valid
    CHECK (reward_rank IS NULL OR reward_rank IN (
      'SILVER', 'GOLD', 'PLATINUM', 'MITHRIL', 'ORICHALCUM', 'ADAMANTITE'
    )),
  CONSTRAINT guild_placement_exam_templates_reward_valid
    CHECK (reward_dzp >= 0)
);

-- ── Placement exams ───────────────────────────────────────────────────────────

CREATE TABLE guild_placement_exams (
  id                    uuid PRIMARY KEY,
  user_id               integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_test_number   integer NOT NULL DEFAULT 1,
  highest_cleared_test  integer NOT NULL DEFAULT 0,
  started_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'IN_PROGRESS',
  assigned_rank         text,
  reward_dzp            integer NOT NULL DEFAULT 0,
  reviewed_by           integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  review_note            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT guild_placement_exams_test_number_valid
    CHECK (current_test_number BETWEEN 1 AND 6),
  CONSTRAINT guild_placement_exams_highest_valid
    CHECK (highest_cleared_test BETWEEN 0 AND 6),
  CONSTRAINT guild_placement_exams_status_valid
    CHECK (status IN ('IN_PROGRESS', 'CASHED_OUT', 'PENDING_REVIEW', 'APPROVED', 'FAILED', 'EXPIRED')),
  CONSTRAINT guild_placement_exams_rank_valid
    CHECK (assigned_rank IS NULL OR assigned_rank IN (
      'IRON', 'COPPER', 'SILVER', 'GOLD',
      'PLATINUM', 'MITHRIL', 'ORICHALCUM', 'ADAMANTITE'
    )),
  CONSTRAINT guild_placement_exams_reward_valid
    CHECK (reward_dzp >= 0)
);

CREATE INDEX guild_placement_exams_status
  ON guild_placement_exams (status, expires_at);

CREATE TABLE guild_placement_exam_attempts (
  id                uuid PRIMARY KEY,
  exam_id           uuid NOT NULL REFERENCES guild_placement_exams(id) ON DELETE CASCADE,
  test_number       integer NOT NULL,
  osu_score_id      bigint NOT NULL,
  score             bigint NOT NULL,
  accuracy          numeric(7,4) NOT NULL,
  max_combo         integer NOT NULL,
  misses            integer NOT NULL,
  mods              text NOT NULL,
  pp                numeric(8,2),
  qualifies         boolean NOT NULL,
  failure_reason    text,
  submitted_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT guild_placement_exam_attempts_test_valid
    CHECK (test_number BETWEEN 1 AND 6),
  CONSTRAINT guild_placement_exam_attempts_score_valid
    CHECK (score >= 0 AND accuracy >= 0 AND accuracy <= 100 AND max_combo >= 0 AND misses >= 0),
  CONSTRAINT guild_placement_exam_attempts_unique_score
    UNIQUE (exam_id, test_number, osu_score_id)
);

CREATE INDEX guild_placement_exam_attempts_exam
  ON guild_placement_exam_attempts (exam_id, test_number, submitted_at DESC);
