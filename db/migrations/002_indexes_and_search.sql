CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_user_hash_user_id ON user_hash (user_id);

CREATE INDEX idx_user_hash_user_active ON user_hash (user_id, is_active);

CREATE INDEX idx_live_catalog ON live_stream (hash, name);

CREATE INDEX idx_movie_catalog ON movie_stream (hash, name);

CREATE INDEX idx_series_catalog ON series_stream (hash, name);

CREATE INDEX idx_live_lookup ON live_stream (hash, stream_id);

CREATE INDEX idx_movie_lookup ON movie_stream (hash, stream_id);

CREATE INDEX idx_series_lookup ON series_stream (hash, stream_id);

CREATE INDEX idx_scheduler_hash ON scheduler (hash_id);

CREATE INDEX idx_scheduler_next_trigger ON scheduler (next_trigger_at);

CREATE INDEX idx_fetch_timing_hash ON fetch_timing (hash_id);

CREATE INDEX idx_stremio_video_list ON series_episode (series_id, season, episode);

CREATE INDEX idx_live_stream_name_trgm ON live_stream USING gin (name gin_trgm_ops);

CREATE INDEX idx_movie_stream_name_trgm ON movie_stream USING gin (name gin_trgm_ops);

CREATE INDEX idx_series_stream_name_trgm ON series_stream USING gin (name gin_trgm_ops);
