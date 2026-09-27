-- Initial Shop catalog.
--
-- These are starter records only. Artwork is intentionally a shared placeholder
-- until the final Shop assets are supplied.

INSERT INTO shop_items (
  id,
  name,
  description,
  category,
  ownership_type,
  lifecycle,
  profile_slot,
  display_order,
  initial_price_dzp,
  current_price_dzp
)
VALUES
  (
    'itm-best-algerian',
    'Best Algerian Player',
    'Held by one player at a time. Anyone can take it for the current steal price.',
    'title',
    'stealable',
    'active',
    'title',
    1,
    50,
    50
  ),
  (
    'itm-desert-king',
    'Desert King',
    'A contested title with a history of changing hands.',
    'title',
    'stealable',
    'active',
    'title',
    2,
    60,
    60
  ),
  (
    'itm-first-blood',
    'First Blood',
    'Unclaimed. The first acquisition starts the ownership chain.',
    'title',
    'stealable',
    'active',
    'title',
    3,
    50,
    50
  ),
  (
    'itm-dune-frame',
    'Dune Frame',
    'A permanent profile frame.',
    'frame',
    'normal',
    'active',
    'frame',
    4,
    90,
    NULL
  ),
  (
    'itm-season-1-badge',
    'Season 1 Veteran',
    'A permanent badge for early osu!DZ participants.',
    'badge',
    'normal',
    'active',
    'badge',
    5,
    40,
    NULL
  ),
  (
    'itm-gilded-username',
    'Gilded Username',
    'A username decoration in polished gold.',
    'username_decoration',
    'normal',
    'active',
    'username_decoration',
    6,
    250,
    NULL
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO shop_item_assets (
  item_id,
  asset_type,
  url,
  alt_text,
  is_active
)
SELECT
  si.id,
  'svg',
  '/assets/shop/placeholder-16x9.svg',
  si.name || ' Shop artwork',
  true
FROM shop_items si
WHERE si.id IN (
  'itm-best-algerian',
  'itm-desert-king',
  'itm-first-blood',
  'itm-dune-frame',
  'itm-season-1-badge',
  'itm-gilded-username'
)
  AND NOT EXISTS (
    SELECT 1
    FROM shop_item_assets sia
    WHERE sia.item_id = si.id
      AND sia.is_active = true
  );
