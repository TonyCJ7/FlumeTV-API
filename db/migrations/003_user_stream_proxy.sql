-- MediaFlow per-user proxy flag + reconcile fingerprint
ALTER TABLE "user"
ADD COLUMN has_proxy BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE stream_proxy_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config_fingerprint TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW ()
);

INSERT INTO
  stream_proxy_state (id, config_fingerprint)
VALUES
  (1, '') ON CONFLICT (id) DO NOTHING;
