-- Level Rush has exactly one prize winner per platform lifetime.
-- The row is created atomically the first time an eligible Level 50 player is recorded.
CREATE TABLE level_rush_winner (
  id integer PRIMARY KEY CHECK (id = 1),
  winner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  won_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (winner_user_id)
);

CREATE INDEX level_rush_winner_user ON level_rush_winner (winner_user_id);
