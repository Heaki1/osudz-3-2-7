-- Challenge-score combo data.
-- Full Combo is judged from the imported score's max combo against the
-- challenge beatmap's authoritative max combo, with zero misses as the FC invariant.
ALTER TABLE challenge_scores
  ADD COLUMN max_combo integer NOT NULL DEFAULT 0,
  ADD COLUMN beatmap_max_combo integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN challenge_scores.max_combo IS
  'Maximum combo achieved by the imported osu! score.';
COMMENT ON COLUMN challenge_scores.beatmap_max_combo IS
  'Maximum combo of the challenge beatmap used when the score was imported.';
