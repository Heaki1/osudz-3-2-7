-- 050_guild_party_quest_templates.sql
-- Guild-supplied Party Quest templates and one-party-per-user enforcement.

CREATE UNIQUE INDEX IF NOT EXISTS guild_party_members_one_party_per_user
  ON guild_party_members (user_id);

CREATE TABLE IF NOT EXISTS guild_party_quest_templates (
  id           uuid PRIMARY KEY,
  title        text NOT NULL,
  exp_bounty   integer NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guild_party_quest_templates_exp_valid CHECK (exp_bounty > 0)
);

ALTER TABLE guild_party_quests
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES guild_party_quest_templates(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS guild_party_quests_template_idx
  ON guild_party_quests (template_id, status);
