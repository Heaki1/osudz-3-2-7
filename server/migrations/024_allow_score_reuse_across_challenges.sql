-- An osu! score id is not globally unique for challenge participation.
--
-- The same play may legitimately be imported for different challenge rounds,
-- including when the same beatmap is reused with a different challenge requirement.
-- challenge_scores is already unique per (round_id, submission_id, user_id), which
-- is the correct identity for a challenge score.

ALTER TABLE challenge_scores
  DROP CONSTRAINT challenge_scores_osu_score_id_key;

COMMENT ON COLUMN challenge_scores.osu_score_id IS
  'osu! score id, when imported from the API. Not globally unique because the same play may be used in different challenge rounds.';
