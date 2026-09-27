-- 028_shop_profile_equipment.sql — selected Shop items for public player profiles.
--
-- Ownership remains in user_shop_items / shop_item_transfers. This table only
-- records a player's current presentation choice for each profile slot.

CREATE TABLE user_shop_profile_equipment (
  user_id      integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_slot text    NOT NULL,
  item_id      text    NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
  equipped_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, profile_slot),

  CONSTRAINT user_shop_profile_equipment_slot_valid
    CHECK (profile_slot IN ('title', 'frame', 'badge', 'username_decoration'))
);

COMMENT ON TABLE user_shop_profile_equipment IS
  'Player-selected Shop presentation items. Ownership is verified by the application on every equip.';

CREATE INDEX user_shop_profile_equipment_item
  ON user_shop_profile_equipment (item_id);
