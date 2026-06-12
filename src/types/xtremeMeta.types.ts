/** Minimal Xtream `get_vod_info` / `get_series_info` `info` object (union of fields both APIs may return). */

export interface XtremeMediaInfo {
  actors?: string;
  backdrop_path?: string[];
  cast?: string;
  cover?: string;
  cover_big?: string;
  description?: string;
  director?: string;
  duration?: string;
  duration_secs?: number;
  episode_run_time?: string;
  genre?: string;
  movie_image?: string;
  name?: string;
  plot?: string;
  rating?: string;
  releaseDate?: string;
  releasedate?: string;
  tmdb_id?: string;
  youtube_trailer?: string;
}

export interface XtremeMovieData {
  stream_id?: number | string;
  name?: string;
  category_id?: string | number;
  container_extension?: string;
}

export interface XtremeEpisode {
  id?: string | number;
  episode_num?: number | string;
  title?: string;
  container_extension?: string;
  season?: number | string;
  info?: {
    youtube_trailer?: string;
    tmdb_id?: string | number;
    releasedate?: string;
    releaseDate?: string;
    plot?: string;
    description?: string;
    cover?: string;
    movie_image?: string;
    cover_big?: string;
    duration_secs?: number;
    duration?: string;
    season?: number | string;
  };
}

export interface XtremeSeasonRow {
  air_date?: string;
  season_number: number;
  episode_count?: number;
  name?: string;
  cover?: string;
  cover_big?: string;
}

export interface XtremeCommonPayload {
  info?: XtremeMediaInfo;
}

export interface XtremeSeriesPayload extends XtremeCommonPayload {
  episodes?: Record<string, XtremeEpisode[]>;
  seasons?: XtremeSeasonRow[];
}

export interface XtremeMoviePayload extends XtremeCommonPayload {
  movie_data?: XtremeMovieData;
}
