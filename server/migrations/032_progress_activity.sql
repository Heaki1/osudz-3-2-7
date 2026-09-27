-- 032_progress_activity.sql
-- Lightweight event stream used by progression, live activity, recap and the public API.

CREATE TABLE activity_events (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  round_id integer REFERENCES rounds(id) ON DELETE SET NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_events_created_at ON activity_events (created_at DESC, id DESC);
CREATE INDEX activity_events_user_created_at ON activity_events (user_id, created_at DESC, id DESC);

COMMENT ON TABLE activity_events IS 'Append-only public activity stream. Payload contains display-safe data only.';
