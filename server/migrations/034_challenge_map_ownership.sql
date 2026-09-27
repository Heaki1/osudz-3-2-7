-- 034_challenge_map_ownership.sql
-- Transferable ownership for challenge maps won in monthly challenges.

CREATE TABLE challenge_map_ownership (
  id            bigserial PRIMARY KEY,
  round_id      integer NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  submission_id integer NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acquired_at   timestamptz NOT NULL DEFAULT now(),
  lost_at       timestamptz
);

CREATE UNIQUE INDEX challenge_map_ownership_current
  ON challenge_map_ownership (round_id, submission_id)
  WHERE lost_at IS NULL;

CREATE INDEX challenge_map_ownership_user
  ON challenge_map_ownership (user_id, acquired_at DESC);

CREATE INDEX challenge_map_ownership_map
  ON challenge_map_ownership (round_id, submission_id, acquired_at DESC);
