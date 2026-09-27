-- Preserve the two qualification sub-awards separately.
--
-- NULL is intentional for map rows frozen before this migration existed.
-- New finalizations/recomputes will always write the exact frozen values.

ALTER TABLE round_dzpp_maps
  ADD COLUMN mod_compliance_points numeric(6,2),
  ADD COLUMN requirement_achievement_points numeric(6,2);

COMMENT ON COLUMN round_dzpp_maps.mod_compliance_points IS
  'Frozen mod-compliance sub-award for this player on this challenge beatmap.';

COMMENT ON COLUMN round_dzpp_maps.requirement_achievement_points IS
  'Frozen challenge-requirement achievement sub-award for this player on this challenge beatmap.';
