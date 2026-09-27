-- Profile frame geometry.
--
-- Stores the diameter of the frame's inner opening as a ratio of the
-- source artwork width. This lets the client fit different frame designs
-- around the fixed 156px profile avatar automatically.

ALTER TABLE shop_item_assets
  ADD COLUMN frame_inner_diameter_ratio numeric(7,6);

ALTER TABLE shop_item_assets
  ADD CONSTRAINT shop_item_assets_frame_inner_ratio_valid
  CHECK (
    frame_inner_diameter_ratio IS NULL
    OR (
      frame_inner_diameter_ratio > 0
      AND frame_inner_diameter_ratio <= 1
    )
  );

COMMENT ON COLUMN shop_item_assets.frame_inner_diameter_ratio IS
  'Profile-frame inner opening diameter divided by source artwork width. NULL for non-frame artwork.';