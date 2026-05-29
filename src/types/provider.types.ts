/** Fields used for SHA-256 Xtream config hash (includes panel credentials). */
export type XtreamHashInput = {
  panelUrl: string;
  hasCustomEpg: boolean;
  customEpg: string | null;
  epgUrl: string | null;
  epgOffset: number;
  panelUsername: string;
  panelPassword: string;
};

/** Fields used for Direct config hash (playlist URL is part of identity). */
export type DirectHashInput = {
  m3uUrl: string;
  hasCustomEpg: boolean;
  epgUrl: string | null;
  epgOffset: number;
};

export type HashConfigXtreamParams = XtreamHashInput & {
  kind: "xtream";
  userId: string;
  /** Precomputed `computeXtreamConfigHash` result. */
  hash: string;
  /** Per-user display title on `user_hash`; excluded from hash canonical payload. */
  configName: string;
};

export type HashConfigDirectParams = DirectHashInput & {
  kind: "direct";
  userId: string;
  /** Precomputed `computeDirectConfigHash` result. */
  hash: string;
  /** Per-user display title on `user_hash`; excluded from hash canonical payload. */
  configName: string;
};

export type HashConfigParams = HashConfigXtreamParams | HashConfigDirectParams;

export type HashConfigResult = {
  hash: string;
  /** True when this transaction created `hash_config` (and shared provider row). */
  createdNewHashConfig: boolean;
};

/** Postgres row from `listUserConfigRows` (`user_hash` … `scheduler` join for GET /api/configs). */
export type UserConfigListDbRow = {
  config_name: string;
  config_type: string;
  direct_epg_offset: number | null;
  direct_epg_url: string | null;
  direct_has_custom_epg: boolean | null;
  direct_m3u_url: string | null;
  hash: string;
  last_synced_at: string | null;
  room_id: number | null;
  room_last_outcome: string | null;
  room_status: string | null;
  sync_bytes_read: number | null;
  sync_bytes_total: number | null;
  sync_percent: number | null;
  sync_phase: string | null;
  scheduler_interval_minutes: number | null;
  scheduler_next_trigger_at: string | null;
  triggered_by: string | null;
  user_is_active: boolean;
  xtream_custom_epg: string | null;
  xtream_epg_offset: number | null;
  xtream_epg_url: string | null;
  xtream_has_custom_epg: boolean | null;
  xtream_url: string | null;
  xtream_username: string | null;
};
