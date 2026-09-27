CREATE TABLE duels (
  id serial PRIMARY KEY,
  challenger_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  difficulty_id bigint NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  difficulty_name text NOT NULL,
  stars numeric(4,2) NOT NULL DEFAULT 0,
  mods text NOT NULL,
  requirement text NOT NULL,
  stake integer NOT NULL CHECK (stake > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','live','settled')),
  challenger_score bigint,
  opponent_score bigint,
  challenger_accuracy numeric(6,4),
  opponent_accuracy numeric(6,4),
  challenger_misses integer,
  opponent_misses integer,
  challenger_score_id bigint,
  opponent_score_id bigint,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX duels_status_ends ON duels(status, ends_at);
CREATE INDEX duels_challenger ON duels(challenger_user_id);
CREATE INDEX duels_opponent ON duels(opponent_user_id);

CREATE TABLE duel_ledger (
  id bigserial PRIMARY KEY,
  duel_id integer REFERENCES duels(id) ON DELETE SET NULL,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('stake','payout','refund','adjustment')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX duel_ledger_user_created ON duel_ledger(user_id, created_at DESC, id DESC);
