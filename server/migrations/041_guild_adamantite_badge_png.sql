-- 041_guild_adamantite_badge_png.sql
-- Use the exported Adamantite PNG badge for the final Guild rank.

UPDATE guild_rank_definitions
SET badge_asset = '/guild/badges/adamantite.png',
    updated_at = now()
WHERE rank = 'ADAMANTITE';
