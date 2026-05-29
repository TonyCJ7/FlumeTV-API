-- FlumeTV initial schema (PostgreSQL 16)
CREATE TABLE "user" (
  user_id TEXT PRIMARY KEY NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE room (
  id BIGSERIAL PRIMARY KEY,
  triggered_by TEXT NOT NULL,
  status TEXT CHECK (
    status IN (
      'idle',
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled',
      'fetching',
      'error'
    )
  ) DEFAULT 'idle',
  sync_percent INTEGER CHECK (
    sync_percent IS NULL
    OR (
      sync_percent >= 0
      AND sync_percent <= 100
    )
  ),
  sync_phase TEXT,
  sync_bytes_read INTEGER,
  sync_bytes_total INTEGER,
  logs_tail TEXT,
  closed_reason TEXT,
  last_outcome TEXT CHECK (
    last_outcome IS NULL
    OR last_outcome IN ('completed', 'failed', 'cancelled', 'error')
  ),
  created_at TIMESTAMPTZ DEFAULT NOW (),
  updated_at TIMESTAMPTZ DEFAULT NOW (),
  FOREIGN KEY (triggered_by) REFERENCES "user" (user_id)
);

CREATE TABLE hash_config (
  hash TEXT PRIMARY KEY NOT NULL,
  config_type TEXT NOT NULL CHECK (config_type IN ('xtreme', 'direct')),
  room_id BIGINT,
  last_synced_at TIMESTAMPTZ,
  FOREIGN KEY (room_id) REFERENCES room (id) ON DELETE SET NULL
);

CREATE TABLE user_hash (
  user_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  config_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, hash),
  FOREIGN KEY (user_id) REFERENCES "user" (user_id) ON DELETE CASCADE,
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE xtream_configs (
  id BIGSERIAL PRIMARY KEY,
  hash_id TEXT NOT NULL,
  url TEXT NOT NULL,
  custom_epg TEXT,
  has_custom_epg BOOLEAN NOT NULL DEFAULT FALSE,
  epg_url TEXT,
  epg_offset INTEGER NOT NULL DEFAULT 0,
  username TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  FOREIGN KEY (hash_id) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE direct_configs (
  id BIGSERIAL PRIMARY KEY,
  hash_id TEXT NOT NULL,
  m3u_url TEXT NOT NULL,
  epg_url TEXT,
  has_custom_epg BOOLEAN NOT NULL DEFAULT FALSE,
  epg_offset INTEGER DEFAULT 0,
  FOREIGN KEY (hash_id) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE live_category (
  id BIGSERIAL PRIMARY KEY,
  category_id INTEGER,
  hash TEXT NOT NULL,
  category_name TEXT NOT NULL,
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE movie_category (
  id BIGSERIAL PRIMARY KEY,
  category_id INTEGER,
  hash TEXT NOT NULL,
  category_name TEXT NOT NULL,
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE series_category (
  id BIGSERIAL PRIMARY KEY,
  category_id INTEGER,
  hash TEXT NOT NULL,
  category_name TEXT NOT NULL,
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE live_stream (
  id BIGSERIAL PRIMARY KEY,
  stream_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT,
  stream_icon TEXT,
  rating TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  category_internal_id BIGINT NOT NULL,
  container_extension TEXT,
  description TEXT,
  epg_channel_id TEXT,
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE,
  FOREIGN KEY (category_internal_id) REFERENCES live_category (id) ON DELETE SET NULL
);

CREATE TABLE movie_stream (
  id BIGSERIAL PRIMARY KEY,
  stream_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT,
  stream_icon TEXT,
  rating TEXT NOT NULL,
  data TEXT,
  category_id INTEGER,
  category_internal_id BIGINT,
  description TEXT,
  container_extension TEXT,
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE,
  FOREIGN KEY (category_internal_id) REFERENCES movie_category (id) ON DELETE SET NULL
);

CREATE TABLE series_stream (
  id BIGSERIAL PRIMARY KEY,
  stream_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT,
  stream_icon TEXT,
  rating TEXT NOT NULL,
  data TEXT,
  category_id INTEGER,
  category_internal_id BIGINT,
  description TEXT,
  container_extension TEXT,
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE,
  FOREIGN KEY (category_internal_id) REFERENCES series_category (id) ON DELETE SET NULL
);

CREATE TABLE series_episode (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL,
  season INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  full_name TEXT,
  thumbnail TEXT,
  UNIQUE (series_id, season, episode),
  FOREIGN KEY (series_id) REFERENCES series_stream (id) ON DELETE CASCADE
);

CREATE TABLE scheduler (
  id BIGSERIAL PRIMARY KEY,
  hash_id TEXT NOT NULL,
  next_trigger_at TIMESTAMPTZ NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 1440,
  UNIQUE (hash_id),
  FOREIGN KEY (hash_id) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE fetch_timing (
  id BIGSERIAL PRIMARY KEY,
  hash_id TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW (),
  FOREIGN KEY (hash_id) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE stream_event_resume (
  hash TEXT PRIMARY KEY NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  last_log_sequence INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW (),
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE
);

CREATE TABLE room_log_line (
  hash TEXT NOT NULL,
  seq INTEGER NOT NULL,
  room_id BIGINT,
  line TEXT NOT NULL,
  level TEXT,
  tone TEXT NOT NULL DEFAULT 'default',
  kind TEXT NOT NULL DEFAULT 'text',
  log_key TEXT,
  sector TEXT,
  status TEXT,
  bytes_read INTEGER,
  bytes_total INTEGER,
  sector_percent INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW (),
  PRIMARY KEY (hash, seq),
  FOREIGN KEY (hash) REFERENCES hash_config (hash) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES room (id) ON DELETE SET NULL
);

CREATE TABLE stream_fetch_status (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL,
  hash_id TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES room (id) ON DELETE CASCADE,
  FOREIGN KEY (hash_id) REFERENCES hash_config (hash) ON DELETE CASCADE
);
