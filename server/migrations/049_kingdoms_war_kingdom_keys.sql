-- 047 was already applied with the short war kingdom keys. The onboarding
-- domain uses the canonical kingdom keys, so correct the live constraints in
-- a new migration instead of editing an applied migration.

ALTER TABLE user_guild_profiles
  DROP CONSTRAINT IF EXISTS user_guild_profiles_kingdom_valid;
ALTER TABLE user_guild_profiles
  ADD CONSTRAINT user_guild_profiles_kingdom_valid
  CHECK (kingdom IS NULL OR kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM'));

ALTER TABLE guild_war_participants
  DROP CONSTRAINT IF EXISTS guild_war_participants_kingdom_valid;
ALTER TABLE guild_war_participants
  ADD CONSTRAINT guild_war_participants_kingdom_valid
  CHECK (kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM'));

ALTER TABLE guild_war_trump_cards
  DROP CONSTRAINT IF EXISTS guild_war_trump_cards_kingdom_valid;
ALTER TABLE guild_war_trump_cards
  ADD CONSTRAINT guild_war_trump_cards_kingdom_valid
  CHECK (kingdom IN ('RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM'));
