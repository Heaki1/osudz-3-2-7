-- 020_multi_challenge_beatmaps.sql
--
-- Supports multiple challenge beatmaps per round.
--
-- round_challenge_beatmaps records which submissions advanced to the challenge
-- phase and in what vote-rank order. It is populated when the admin approves the
-- winner (routes/admin.ts POST /round/winner), using the top-N most-voted
-- approved entries where N = site_settings.max_challenge_beatmaps (NULL = all).
--
-- challenge_scores gains submission_id so each score is tied to a specific
-- challenge beatmap rather than just to the round. The old unique constraint
-- (round_id, user_id) is replaced by (round_id, submission_id, user_id).
-- submission_id is nullable so existing rows are not broken; new rows always
-- carry it.
--
-- Do not add BEGIN/COMMIT — the runner wraps each file in one transaction.

CREATE TABLE round_challenge_beatmaps (
  id            serial      PRIMARY KEY,
  round_id      integer     NOT NULL REFERENCES rounds(id)      ON DELETE CASCADE,
  submission_id integer     NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  vote_rank     integer     NOT NULL,
  CONSTRAINT round_challenge_beatmaps_unique UNIQUE (round_id, submission_id),
  CONSTRAINT round_challenge_beatmaps_rank_unique UNIQUE (round_id, vote_rank)
);

COMMENT ON TABLE round_challenge_beatmaps IS
  'Submissions that advanced to the challenge phase for a round, in vote-rank order.';
COMMENT ON COLUMN round_challenge_beatmaps.vote_rank IS
  '1 = most votes. Ties in vote count share the same rank as the winning submission.';

-- Add submission_id to challenge_scores.
ALTER TABLE challenge_scores
  ADD COLUMN submission_id integer REFERENCES submissions(id) ON DELETE SET NULL;

COMMENT ON COLUMN challenge_scores.submission_id IS
  'Which challenge beatmap this score was set on. NULL for scores recorded before migration 020.';

-- Replace the old per-round unique constraint with a per-beatmap one.
ALTER TABLE challenge_scores
  DROP CONSTRAINT challenge_scores_one_per_user_per_round;

ALTER TABLE challenge_scores
  ADD CONSTRAINT challenge_scores_one_per_user_per_beatmap
    UNIQUE (round_id, submission_id, user_id);

-- Index for leaderboard reads scoped to one beatmap.
CREATE INDEX challenge_scores_by_submission
  ON challenge_scores (round_id, submission_id, score DESC);
