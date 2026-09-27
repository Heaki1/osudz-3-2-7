-- Record which administrator created a manual DZP adjustment.
--
-- Automated rewards and Shop transactions leave created_by NULL.
-- Manual admin_adjustment entries identify the administrator who authorized them.

ALTER TABLE dzp_ledger
  ADD COLUMN created_by integer
  REFERENCES users(id)
  ON DELETE SET NULL;

CREATE INDEX dzp_ledger_created_by_idx
  ON dzp_ledger(created_by);
