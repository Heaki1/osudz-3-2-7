-- Animated Shop artwork support.
--
-- Shop artwork remains one active URL-backed asset per item. This migration adds
-- explicit animation metadata and accepts the image formats we use for animated titles.

ALTER TABLE shop_item_assets
  ADD COLUMN IF NOT EXISTS is_animated boolean NOT NULL DEFAULT false;

ALTER TABLE shop_item_assets
  DROP CONSTRAINT IF EXISTS shop_item_assets_type_valid;

ALTER TABLE shop_item_assets
  DROP CONSTRAINT IF EXISTS shop_item_assets_asset_type_check;

ALTER TABLE shop_item_assets
  ADD CONSTRAINT shop_item_assets_asset_type_check
  CHECK (asset_type IN ('png', 'webp', 'gif', 'apng', 'svg'));

UPDATE shop_item_assets
SET is_animated = true
WHERE asset_type IN ('gif', 'apng');
