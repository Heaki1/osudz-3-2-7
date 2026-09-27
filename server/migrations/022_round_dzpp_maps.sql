-- 022_round_dzpp_maps.sql
--
-- Frozen DZPP breakdown for every player on every challenge beatmap.
--
-- round_dzpp remains the authoritative one-row-per-player-per-round total.
-- This child table preserves the individual map results that were evaluated
-- before scoreAllBeatmaps merged them to the player's best result.

CREATE TABLE round_dzpp_maps (
  round_id             integer      NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  submission_id        integer      NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id              integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote_rank            integer      NOT NULL,

  -- Frozen copy of the play that produced this map result.
  score                bigint       NOT NULL,
  accuracy             numeric(5,2) NOT NULL,
  misses               integer      NOT NULL,
  max_combo            integer      NOT NULL,
  beatmap_max_combo    integer      NOT NULL,
  mods                 text         NOT NULL,
  osu_score_id         bigint,

  -- Frozen DZPP terms for this map.
  performance_value    numeric(8,2),
  completion_points    numeric(6,2) NOT NULL,
  qualification_points numeric(6,2) NOT NULL,
  placement_points     numeric(6,3) NOT NULL,
  placement            integer,
  qualified            boolean      NOT NULL,
  field_size           integer      NOT NULL,
  final_dzpp           integer      NOT NULL,
  formula_version      integer      NOT NULL,

  -- True when this map is the one selected for the player's round_dzpp row.
  counted              boolean      NOT NULL DEFAULT false,

  finalized_at         timestamptz  NOT NULL DEFAULT now(),

  PRIMARY KEY (round_id, submission_id, user_id)
);

COMMENT ON TABLE round_dzpp_maps IS
  'Frozen DZPP result for each player and each challenge beatmap in a round. round_dzpp remains the authoritative merged total.';

COMMENT ON COLUMN round_dzpp_maps.counted IS
  'True when this map produced the player''s authoritative round_dzpp result after the multi-beatmap merge.';

COMMENT ON COLUMN round_dzpp_maps.final_dzpp IS
  'This map''s complete frozen DZPP result before the player-level merge.';

CREATE INDEX round_dzpp_maps_user
  ON round_dzpp_maps (user_id, round_id);

CREATE INDEX round_dzpp_maps_round_submission
  ON round_dzpp_maps (round_id, submission_id);

CREATE UNIQUE INDEX round_dzpp_maps_one_counted
  ON round_dzpp_maps (round_id, user_id)
  WHERE counted;
