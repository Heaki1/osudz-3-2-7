-- 019_max_challenge_beatmaps.sql
--
-- Adds an optional cap on how many submissions may be approved in a single round.
-- When set, the admin review endpoint refuses to approve a submission once the
-- round already has max_challenge_beatmaps approved entries.
--
-- NULL means no limit, which is what the platform enforced before this migration,
-- so applying it changes nothing until an administrator writes to the Beatmap Rules tab.
--
-- Do not add BEGIN/COMMIT — the runner wraps each file in one transaction.

ALTER TABLE site_settings
  ADD COLUMN max_challenge_beatmaps integer
    CONSTRAINT site_settings_max_challenge_beatmaps_positive CHECK (max_challenge_beatmaps > 0);

COMMENT ON COLUMN site_settings.max_challenge_beatmaps IS
  'Maximum number of approved submissions allowed per round. NULL means no limit.';
