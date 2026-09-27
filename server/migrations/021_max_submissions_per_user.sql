-- 021_max_submissions_per_user.sql
--
-- Adds an optional per-user submission cap for each round.
-- NULL means no limit.
--
-- Rejected submissions do not count toward the cap, so a user whose
-- submission was rejected can submit again.
--
-- The old one-submission-per-user-per-round constraint is removed because
-- multiple active submissions are now allowed when the administrator
-- configures a limit greater than 1.
--
-- Do not add BEGIN/COMMIT — the runner wraps each file in one transaction.

ALTER TABLE site_settings
  ADD COLUMN max_submissions_per_user integer
    CONSTRAINT site_settings_max_submissions_per_user_positive
    CHECK (max_submissions_per_user > 0);

COMMENT ON COLUMN site_settings.max_submissions_per_user IS
  'Maximum number of non-rejected submissions a user may have in a round. NULL means no limit.';

ALTER TABLE submissions
  DROP CONSTRAINT submissions_one_per_user_per_round;
