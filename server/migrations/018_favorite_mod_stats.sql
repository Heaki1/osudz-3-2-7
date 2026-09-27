-- Preserve osu! difficulty stats on stored favorites.
--
-- Nullable because the osu! API can legitimately omit a value.
-- NULL means "not available"; it must not be replaced with 0.

ALTER TABLE favorites
  ADD COLUMN cs numeric(4,2),
  ADD COLUMN ar numeric(4,2),
  ADD COLUMN od numeric(4,2),
  ADD COLUMN hp numeric(4,2);
