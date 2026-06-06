/** Scalar field shape from Xtream panel JSON (string ids, numeric ids, or absent). */
export type XtreamPanelField = string | number | null | undefined;

/** Raw row from Xtream `get_*_categories` player_api response (ingress until factory coercion). */
export type XtreamPanelCategoryRow = Readonly<{
  category_id?: XtreamPanelField;
  id?: XtreamPanelField;
  category_name?: XtreamPanelField;
  name?: XtreamPanelField;
}>;

/** Raw row from Xtream `get_live_streams` / `get_vod_streams` / `get_series` player_api response. */
export type XtreamPanelStreamRow = Readonly<{
  stream_id?: XtreamPanelField;
  series_id?: XtreamPanelField;
  num?: XtreamPanelField;
  category_id?: XtreamPanelField;
  name?: XtreamPanelField;
  title?: XtreamPanelField;
  full_name?: XtreamPanelField;
  tv_archive_name?: XtreamPanelField;
  stream_icon?: XtreamPanelField;
  cover?: XtreamPanelField;
  cover_big?: XtreamPanelField;
  movie_image?: XtreamPanelField;
  rating?: XtreamPanelField;
  rating_5based?: XtreamPanelField;
  plot?: XtreamPanelField;
  description?: XtreamPanelField;
  container_extension?: XtreamPanelField;
  epg_channel_id?: XtreamPanelField;
  epg_channel?: XtreamPanelField;
}>;

/** Ingress object from Xtream `get_user_info` player_api response. */
export type XtreamUserInfoIngress = Readonly<{
  user_info?: Readonly<{
    auth?: XtreamPanelField;
  }> | null;
}>;

export type XtreamFormattedCategory = {
  providerCategoryId: number | null;
  name: string;
};

export type XtreamFormattedLiveStream = {
  streamId: number;
  name: string;
  fullName: string | null;
  streamIcon: string | null;
  rating: string;
  providerCategoryId: number;
  containerExtension: string | null;
  description: string | null;
  epgChannelId: string | null;
};

export type XtreamFormattedVodStream = {
  streamId: number;
  name: string;
  fullName: string | null;
  streamIcon: string | null;
  rating: string;
  providerCategoryId: number;
  data: string | null;
  description: string | null;
  containerExtension: string | null;
};

export type XtreamFormattedSeriesStream = {
  streamId: number;
  name: string;
  fullName: string | null;
  streamIcon: string | null;
  rating: string;
  providerCategoryId: number;
  data: string | null;
  description: string | null;
  containerExtension: string | null;
};

/** Panel URL, EPG options, and encrypted credentials for one `hash` (`xtream_configs` row). */
export type XtreamSyncContextRow = {
  url: string;
  username: string;
  password_enc: string;
  custom_epg: string | null;
  has_custom_epg: boolean;
  epg_url: string | null;
  epg_offset: number;
};

export type FormattedXtreamCatalog = {
  liveCategories: XtreamFormattedCategory[];
  movieCategories: XtreamFormattedCategory[];
  seriesCategories: XtreamFormattedCategory[];
  liveStreams: XtreamFormattedLiveStream[];
  movieStreams: XtreamFormattedVodStream[];
  seriesStreams: XtreamFormattedSeriesStream[];
};
