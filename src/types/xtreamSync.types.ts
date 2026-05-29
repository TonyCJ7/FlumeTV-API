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
