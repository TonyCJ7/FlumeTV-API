import { ADDON_STREAM_TYPE, CONFIG_TYPE } from "@/constants/stream.constants";
import { MapToUnion } from "./common.types";

export type Stream = {
  id: number;
  stream_id: number;
  hash: string;
  name: string;
  /** Display name including group path / series context when available (e.g. from M3U). */
  full_name?: string;
  stream_icon?: string;
  url?: string;
  rating: string;
  category_id?: number;
  category_internal_id?: number;
  description?: string;
  container_extension?: string;
  /** Xtream panel EPG channel id when present on `get_live_streams` rows. */
  epg_channel_id?: string | null;
};

export type Category = {
  id: number;
  category_id: number;
  hash: string;
  category_name: string;
};

/** Joined SQL row from `getStreamAndConfigById` (`stream` + `hash_config` + provider tables). */
export type StreamWithConfigDbRow = {
  id: string | number;
  stream_id: number;
  hash: string;
  name: string;
  full_name: string | null;
  stream_icon: string | null;
  rating: string;
  category_id: number | null;
  category_internal_id: number | null;
  description: string | null;
  container_extension: string | null;
  data: string | null;
  epg_channel_id: string | null;
  config_type: string;
  xtreme_url: string | null;
  username: string | null;
  password: string | null;
  has_custom_epg: boolean | null;
  custom_epg: string | null;
  epg_url: string | null;
  epg_offset: number | null;
  m3u_url: string | null;
};

/**
 * Xtream branch row from `getStreamAndConfigById`: panel URL, EPG fields, and credentials from `xtream_configs`;
 * `password` is decrypted from `password_enc` when sealed with `encryptSecretForStorage`.
 */
export type XtremeConfig = {
  xtreme_url?: string;
  username: string;
  password: string;
  has_custom_epg?: boolean;
  custom_epg?: string | null;
  epg_url?: string | null;
  epg_offset?: number;
};

export type DirectConfig = {
  id: number;
  hash_id: string;
  m3u_url: string;
  epg_url: string;
  has_custom_epg: boolean;
  epg_offset: number;
};

export type SeriesEpisode = {
  id: number;
  series_id: number;
  season: number;
  episode: number;
  title?: string;
  /** Full episode label (e.g. "Series · S01E02 · Title") when stored separately from `title`. */
  full_name?: string;
  thumbnail?: string;
  url: string;
};

export type ConfigType = MapToUnion<typeof CONFIG_TYPE>;

export type StreamWithConfig = {
  XtremeConfig: Stream & XtremeConfig & { config_type: ConfigType };
  DirectConfig: Pick<DirectConfig, "m3u_url" | "epg_url" | "has_custom_epg"> &
    Stream & {
      config_type: ConfigType;
    };
};

export type AddonStreamType = MapToUnion<typeof ADDON_STREAM_TYPE>;

/** Decoded `iptv_t1496:` token: DB stream row PK, provider `stream_id`, optional per-video key. */
export type ParsedStremioStreamId = {
  id: string;
  stream_id: string;
  /** New tokens: episode / playback key. Omitted on legacy tokens (use `stream_id` for episode id). */
  video_id?: string;
};
