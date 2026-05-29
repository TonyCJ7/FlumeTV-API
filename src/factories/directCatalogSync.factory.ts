import type {
  DirectFormattedCategory,
  DirectFormattedLiveStream,
  DirectFormattedSeriesEpisode,
  DirectFormattedVodStream,
  FormattedDirectCatalog,
  M3uParsedEntry,
} from "@/types/directSync.types";
import { trimmedOrFallback } from "@/utils/common.utils";
import { parseSeasonEpisodeFromTitle } from "@/utils/title.utils";
import { fileExtensionFromUrl } from "@/utils/url.utils";
import _map from "lodash/map";
import _toLower from "lodash/toLower";
import _trim from "lodash/trim";

const DEFAULT_RATING = "0";

function looksMovieLike(groupTitle: string | null, url: string): boolean {
  const g = _toLower(groupTitle ?? "");

  if (/\b(vod|movie|movies|film|films|cinema|4k[-\s]?movies?|ktv)\b/.test(g)) {
    return true;
  }

  return /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)(\?|#|$)/i.test(url);
}

function buildSeriesGroupKey(groupTitle: string | null, seriesTitle: string): string {
  return `${groupTitle ?? ""}\u0000${seriesTitle}`;
}

type SeriesAccumulator = {
  categoryId: number;
  displayName: string;
  logo: string | null;
};

type ParsedSeasonEpisode = NonNullable<ReturnType<typeof parseSeasonEpisodeFromTitle>>;

type ProviderCategoryResolution =
  | { kind: "existing"; providerCategoryId: number }
  | { kind: "new"; categoryName: string; providerCategoryId: number };

/**
 * Pure: reads `categoryIndex` only; no mutation.
 */
function resolveProviderCategoryId(
  categoryOrderLength: number,
  categoryIndex: Map<string, number>,
  label: string,
): ProviderCategoryResolution {
  const categoryName = trimmedOrFallback(_trim(label), "Uncategorized");
  const existingId = categoryIndex.get(categoryName);

  if (existingId != null) {
    return { kind: "existing", providerCategoryId: existingId };
  }

  return {
    categoryName,
    kind: "new",
    providerCategoryId: categoryOrderLength + 1,
  };
}

function resolveSeriesCatalogLabels(
  entry: M3uParsedEntry,
  seasonEpisode: ParsedSeasonEpisode,
): { catLabel: string; seriesTitle: string } {
  const fromGroup = _trim(entry.groupTitle ?? "");
  const seriesTitle =
    seasonEpisode.seriesTitleHint.length > 0
      ? seasonEpisode.seriesTitleHint
      : fromGroup.length > 0
        ? fromGroup
        : entry.displayTitle;
  const catLabel = trimmedOrFallback(fromGroup, "Series");

  return { catLabel, seriesTitle };
}

function buildMovieVodStreamFromParsedEntry(args: {
  entry: M3uParsedEntry;
  providerCategoryId: number;
  streamId: number;
}): DirectFormattedVodStream {
  const { entry, providerCategoryId, streamId } = args;
  const ext = fileExtensionFromUrl(entry.url);

  return {
    containerExtension: ext,
    data: entry.url,
    description: null,
    fullName: entry.displayTitle,
    name: entry.displayTitle,
    providerCategoryId,
    rating: DEFAULT_RATING,
    streamIcon: entry.logo,
    streamId,
  };
}

function buildLiveStreamFromParsedEntry(args: {
  entry: M3uParsedEntry;
  providerCategoryId: number;
  streamId: number;
}): DirectFormattedLiveStream {
  const { entry, providerCategoryId, streamId } = args;
  const ext = fileExtensionFromUrl(entry.url);

  return {
    containerExtension: ext,
    description: null,
    epgChannelId: null,
    fullName: entry.displayTitle,
    name: entry.displayTitle,
    providerCategoryId,
    rating: DEFAULT_RATING,
    streamIcon: entry.logo,
    streamId,
  };
}

function categoriesFromOrder(names: string[]): DirectFormattedCategory[] {
  return _map(names, (name, index) => {
    return {
      name: name ?? "",
      providerCategoryId: index + 1,
    };
  });
}

/**
 * Pure map: parsed M3U rows → formatted catalog rows (no HTTP / DB).
 * Category lists/maps and output streams are updated only in this function body (single owner).
 */
export function directFormattedCatalogFactory(parsed: M3uParsedEntry[]): FormattedDirectCatalog {
  const liveCatOrder: string[] = [];
  const liveCatIndex = new Map<string, number>();
  const movieCatOrder: string[] = [];
  const movieCatIndex = new Map<string, number>();
  const seriesCatOrder: string[] = [];
  const seriesCatIndex = new Map<string, number>();

  function commitSeriesCategory(label: string): number {
    const resolution = resolveProviderCategoryId(seriesCatOrder.length, seriesCatIndex, label);

    if (resolution.kind === "new") {
      seriesCatOrder.push(resolution.categoryName);
      seriesCatIndex.set(resolution.categoryName, resolution.providerCategoryId);
    }

    return resolution.providerCategoryId;
  }

  function commitMovieCategory(label: string): number {
    const resolution = resolveProviderCategoryId(movieCatOrder.length, movieCatIndex, label);

    if (resolution.kind === "new") {
      movieCatOrder.push(resolution.categoryName);
      movieCatIndex.set(resolution.categoryName, resolution.providerCategoryId);
    }

    return resolution.providerCategoryId;
  }

  function commitLiveCategory(label: string): number {
    const resolution = resolveProviderCategoryId(liveCatOrder.length, liveCatIndex, label);

    if (resolution.kind === "new") {
      liveCatOrder.push(resolution.categoryName);
      liveCatIndex.set(resolution.categoryName, resolution.providerCategoryId);
    }

    return resolution.providerCategoryId;
  }

  const liveStreams: DirectFormattedLiveStream[] = [];
  const movieStreams: DirectFormattedVodStream[] = [];
  const seriesEpisodes: DirectFormattedSeriesEpisode[] = [];
  const seriesAccum = new Map<string, SeriesAccumulator>();
  const episodeDedupe = new Set<string>();

  let nextLiveStreamId = 1;
  let nextMovieStreamId = 1;

  for (const entry of parsed) {
    const seasonEpisode = parseSeasonEpisodeFromTitle(entry.displayTitle);

    if (seasonEpisode) {
      const { catLabel, seriesTitle } = resolveSeriesCatalogLabels(entry, seasonEpisode);
      const providerCategoryId = commitSeriesCategory(catLabel);
      const key = buildSeriesGroupKey(entry.groupTitle, seriesTitle);

      if (!seriesAccum.has(key)) {
        seriesAccum.set(key, {
          categoryId: providerCategoryId,
          displayName: seriesTitle,
          logo: entry.logo,
        });
      }

      const episodeKey = `${key}\u0000${seasonEpisode.season}\u0000${seasonEpisode.episode}`;

      if (episodeDedupe.has(episodeKey)) {
        continue;
      }

      episodeDedupe.add(episodeKey);

      seriesEpisodes.push({
        episode: seasonEpisode.episode,
        fullName: entry.displayTitle,
        season: seasonEpisode.season,
        seriesGroupKey: key,
        thumbnail: entry.logo,
        title: entry.displayTitle,
        url: entry.url,
      });
      continue;
    }

    if (looksMovieLike(entry.groupTitle, entry.url)) {
      const catLabel = trimmedOrFallback(_trim(entry.groupTitle ?? ""), "Movies");
      const providerCategoryId = commitMovieCategory(catLabel);

      movieStreams.push(
        buildMovieVodStreamFromParsedEntry({
          entry,
          providerCategoryId,
          streamId: nextMovieStreamId,
        }),
      );
      nextMovieStreamId += 1;
      continue;
    }

    const catLabel = trimmedOrFallback(_trim(entry.groupTitle ?? ""), "Live");
    const providerCategoryId = commitLiveCategory(catLabel);

    liveStreams.push(
      buildLiveStreamFromParsedEntry({
        entry,
        providerCategoryId,
        streamId: nextLiveStreamId,
      }),
    );
    nextLiveStreamId += 1;
  }

  const seriesStreams = _map([...seriesAccum], ([key, meta], index) => {
    return {
      containerExtension: null,
      data: null,
      description: null,
      fullName: meta.displayName,
      groupKey: key,
      name: meta.displayName,
      providerCategoryId: meta.categoryId,
      rating: DEFAULT_RATING,
      streamIcon: meta.logo,
      streamId: index + 1,
    };
  });

  return {
    liveCategories: categoriesFromOrder(liveCatOrder),
    liveStreams,
    movieCategories: categoriesFromOrder(movieCatOrder),
    movieStreams,
    seriesCategories: categoriesFromOrder(seriesCatOrder),
    seriesEpisodes,
    seriesStreams,
  };
}
