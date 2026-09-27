-- Authoritative duel-arena rules acceptance plus beatmap-set artwork metadata.

CREATE TABLE duel_rules_acceptance (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rules_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE duels
  ADD COLUMN beatmapset_id bigint;

CREATE INDEX duels_beatmapset ON duels(beatmapset_id);
