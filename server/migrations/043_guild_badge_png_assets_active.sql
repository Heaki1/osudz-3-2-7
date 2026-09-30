-- 043_guild_badge_png_assets_active.sql
-- Use the directly served high-resolution PNG badge artwork for Guild rank profiles.

UPDATE guild_rank_definitions
SET badge_asset = CASE rank
  WHEN 'IRON' THEN '/guild/badges/iron.png'
  WHEN 'COPPER' THEN '/guild/badges/copper.png'
  WHEN 'SILVER' THEN '/guild/badges/silver.png'
  WHEN 'GOLD' THEN '/guild/badges/gold.png'
  WHEN 'PLATINUM' THEN '/guild/badges/platinum.png'
  WHEN 'MITHRIL' THEN '/guild/badges/mithril.png'
  WHEN 'ORICHALCUM' THEN '/guild/badges/orichalcum.png'
  WHEN 'ADAMANTITE' THEN '/guild/badges/adamantite.png'
  ELSE badge_asset
END,
updated_at = now()
WHERE rank IN ('IRON', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'MITHRIL', 'ORICHALCUM', 'ADAMANTITE');
