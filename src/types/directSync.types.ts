/** Parsed `#EXTINF` attribute fields before URL pairing. */
export type M3uExtinfLineParts = {
  displayTitle: string;
  groupTitle: string | null;
  logo: string | null;
};

/** In-memory M3U row before grouping into Stremio catalog tables. */

export type M3uParsedEntry = {
  url: string;
  /** From last comma of EXTINF; may include series/episodes markers. */
  displayTitle: string;
  groupTitle: string | null;
  logo: string | null;
};

export type DirectFormattedCategory = {
  providerCategoryId: number | null;
  name: string;
};

export type DirectFormattedLiveStream = {
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

export type DirectFormattedVodStream = {
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

export type DirectFormattedSeriesStream = {
  /** Stable within one sync; matches `DirectFormattedSeriesEpisode.seriesGroupKey`. */
  groupKey: string;
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

/** One row in `series_episode`; `seriesGroupKey` joins to `DirectFormattedSeriesStream.groupKey`. */
export type DirectFormattedSeriesEpisode = {
  seriesGroupKey: string;
  season: number;
  episode: number;
  url: string;
  title: string | null;
  fullName: string | null;
  thumbnail: string | null;
};

export type FormattedDirectCatalog = {
  liveCategories: DirectFormattedCategory[];
  movieCategories: DirectFormattedCategory[];
  seriesCategories: DirectFormattedCategory[];
  liveStreams: DirectFormattedLiveStream[];
  movieStreams: DirectFormattedVodStream[];
  seriesStreams: DirectFormattedSeriesStream[];
  seriesEpisodes: DirectFormattedSeriesEpisode[];
};

export type DirectSyncContextRow = {
  epg_offset: number | null;
  epg_url: string | null;
  has_custom_epg: boolean;
  m3u_url: string;
};
