-- 045_guild_parties.sql
-- Elite-family Adventurer Parties and persistent Party Quests.

CREATE TABLE IF NOT EXISTS guild_parties (
  id           uuid PRIMARY KEY,
  leader_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guild_party_members (
  party_id     uuid NOT NULL REFERENCES guild_parties(id) ON DELETE CASCADE,
  user_id      integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, user_id)
);

CREATE INDEX IF NOT EXISTS guild_party_members_user_idx
  ON guild_party_members (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS guild_party_quests (
  id             uuid PRIMARY KEY,
  party_id       uuid NOT NULL REFERENCES guild_parties(id) ON DELETE CASCADE,
  accepted_by    integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  exp_bounty     integer NOT NULL,
  status         text NOT NULL DEFAULT 'ACCEPTED',
  accepted_at    timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  CONSTRAINT guild_party_quests_exp_valid CHECK (exp_bounty > 0),
  CONSTRAINT guild_party_quests_status_valid CHECK (status IN ('ACCEPTED', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS guild_party_quests_party_status_idx
  ON guild_party_quests (party_id, status, accepted_at DESC);

CREATE TABLE IF NOT EXISTS guild_party_quest_members (
  party_quest_id uuid NOT NULL REFERENCES guild_party_quests(id) ON DELETE CASCADE,
  user_id        integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outcome        text NOT NULL,
  contribution   integer NOT NULL DEFAULT 0,
  exp_awarded    integer NOT NULL DEFAULT 0,
  attempt_id     uuid REFERENCES beatmap_hunt_attempts(id) ON DELETE SET NULL,
  PRIMARY KEY (party_quest_id, user_id),
  CONSTRAINT guild_party_quest_member_outcome_valid CHECK (outcome IN ('ACTIVE', 'LEECH')),
  CONSTRAINT guild_party_quest_member_contribution_valid CHECK (contribution >= 0),
  CONSTRAINT guild_party_quest_member_exp_valid CHECK (exp_awarded >= 0)
);
