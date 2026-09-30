-- 042_guild_badge_svg_assets.sql
-- Point the persisted Adventurer Guild rank definitions at the new SVG badge assets.

UPDATE guild_rank_definitions
SET badge_asset = CASE rank
  WHEN 'IRON' THEN '/guild/badges/iron.svg'
  WHEN 'COPPER' THEN '/guild/badges/copper.svg'
  WHEN 'SILVER' THEN '/guild/badges/silver.svg'
  WHEN 'GOLD' THEN '/guild/badges/gold.svg'
  WHEN 'PLATINUM' THEN '/guild/badges/platinum.svg'
  WHEN 'MITHRIL' THEN '/guild/badges/mithril.svg'
  WHEN 'ORICHALCUM' THEN '/guild/badges/orichalcum.svg'
  WHEN 'ADAMANTITE' THEN '/guild/badges/adamantite.svg'
  ELSE badge_asset
END,
updated_at = now()
WHERE rank IN ('IRON', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'MITHRIL', 'ORICHALCUM', 'ADAMANTITE');