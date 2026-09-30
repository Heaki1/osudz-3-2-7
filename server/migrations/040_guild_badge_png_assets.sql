-- 040_guild_badge_png_assets.sql
-- Use the newly exported PNG Guild badge artwork for ranks that are ready.
-- Adamantite remains on its existing SVG until its PNG export is ready.

UPDATE guild_rank_definitions
SET badge_asset = CASE rank
  WHEN 'IRON' THEN '/guild/badges/iron.png'
  WHEN 'COPPER' THEN '/guild/badges/copper.png'
  WHEN 'SILVER' THEN '/guild/badges/silver.png'
  WHEN 'GOLD' THEN '/guild/badges/gold.png'
  WHEN 'PLATINUM' THEN '/guild/badges/platinum.png'
  WHEN 'MITHRIL' THEN '/guild/badges/mithril.png'
  WHEN 'ORICHALCUM' THEN '/guild/badges/orichalcum.png'
  ELSE badge_asset
END,
updated_at = now()
WHERE rank IN ('IRON', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'MITHRIL', 'ORICHALCUM');
