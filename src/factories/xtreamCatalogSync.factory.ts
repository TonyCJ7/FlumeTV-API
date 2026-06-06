import _isEmpty from "lodash/isEmpty";
import _toNumber from "lodash/toNumber";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import { XTREAM_FALLBACK_CATEGORY_ID } from "@/constants/stream.constants";
import type {
  XtreamFormattedCategory,
  XtreamFormattedLiveStream,
  XtreamFormattedSeriesStream,
  XtreamFormattedVodStream,
  XtreamPanelCategoryRow,
  XtreamPanelStreamRow,
} from "@/types/xtreamSync.types";
import { normalizeProviderCategoryId, resolvedContainerExtension } from "@/utils/xtreamMeta.utils";

/** Build formatted category rows from Xtream `get_*_categories` panel list entries. */
export function xtreamCategoriesFromPanelFactory(
  rows: XtreamPanelCategoryRow[],
): XtreamFormattedCategory[] {
  const byId = new Map<number, XtreamFormattedCategory>();

  for (const row of rows) {
    const idRaw = row.category_id ?? row.id;
    const idNum = _toNumber(idRaw);

    if (!Number.isFinite(idNum)) {
      continue;
    }

    const nameRaw = row.category_name ?? row.name ?? "";
    const name = _trim(_toString(nameRaw)) || "Unknown";

    byId.set(idNum, { name, providerCategoryId: idNum });
  }

  return [...byId.values()];
}

/** Ensure every category id referenced by streams has a label (merge panel names + synthetic fallbacks). */
export function xtreamCategoriesForIdsFactory(params: {
  fromPanel: XtreamFormattedCategory[];
  neededIds: number[];
  uncategorizedLabel: string;
}): XtreamFormattedCategory[] {
  const map = new Map<number, XtreamFormattedCategory>();

  for (const category of params.fromPanel) {
    if (category.providerCategoryId != null) {
      map.set(category.providerCategoryId, category);
    }
  }

  for (const id of params.neededIds) {
    if (map.has(id)) {
      continue;
    }

    const label = id === XTREAM_FALLBACK_CATEGORY_ID ? params.uncategorizedLabel : `Category ${id}`;

    map.set(id, { name: label, providerCategoryId: id });
  }

  return [...map.values()];
}

/** Map `get_live_streams` rows to formatted live catalog streams. */
export function xtreamLiveStreamsFactory(
  rows: XtreamPanelStreamRow[],
): XtreamFormattedLiveStream[] {
  const streams: XtreamFormattedLiveStream[] = [];

  for (const row of rows) {
    const streamId = _toNumber(row.stream_id ?? row.num);

    if (!Number.isFinite(streamId) || streamId <= 0) {
      continue;
    }

    const providerCategoryId = normalizeProviderCategoryId(row.category_id);
    const nameRaw = row.name ?? row.title ?? "";
    const name = _trim(_toString(nameRaw)) || `Channel ${streamId}`;
    const fullNameRaw = row.full_name ?? row.tv_archive_name ?? "";
    const fullNameTrimmed = _trim(_toString(fullNameRaw));
    const fullName = _isEmpty(fullNameTrimmed) ? null : fullNameTrimmed;
    const iconRaw = row.stream_icon ?? row.cover ?? row.cover_big ?? "";
    const iconTrimmed = _trim(_toString(iconRaw));
    const streamIcon = _isEmpty(iconTrimmed) ? null : iconTrimmed;
    const ratingRaw = row.rating ?? row.rating_5based ?? "0";
    const rating = _trim(_toString(ratingRaw)) || "0";
    const plotRaw = row.plot ?? row.description ?? "";
    const plotTrimmed = _trim(_toString(plotRaw));
    const description = _isEmpty(plotTrimmed) ? null : plotTrimmed;
    const ext = resolvedContainerExtension(_toString(row.container_extension));
    const containerExtension = _isEmpty(_trim(ext)) ? null : ext;
    const epgRaw = row.epg_channel_id ?? row.epg_channel ?? "";
    const epgTrimmed = _trim(_toString(epgRaw));
    const epgChannelId = _isEmpty(epgTrimmed) ? null : epgTrimmed;

    streams.push({
      containerExtension,
      description,
      epgChannelId,
      fullName,
      name,
      providerCategoryId,
      rating,
      streamIcon,
      streamId,
    });
  }

  return streams;
}

/** Map `get_vod_streams` rows to formatted VOD catalog streams. */
export function xtreamVodStreamsFactory(rows: XtreamPanelStreamRow[]): XtreamFormattedVodStream[] {
  const streams: XtreamFormattedVodStream[] = [];

  for (const row of rows) {
    const streamId = _toNumber(row.stream_id ?? row.num);

    if (!Number.isFinite(streamId) || streamId <= 0) {
      continue;
    }

    const providerCategoryId = normalizeProviderCategoryId(row.category_id);
    const nameRaw = row.name ?? row.title ?? "";
    const name = _trim(_toString(nameRaw)) || `Movie ${streamId}`;
    const fullNameRaw = row.full_name ?? "";
    const fullNameTrimmed = _trim(_toString(fullNameRaw));
    const fullName = _isEmpty(fullNameTrimmed) ? null : fullNameTrimmed;
    const iconRaw = row.stream_icon ?? row.cover ?? row.movie_image ?? "";
    const iconTrimmed = _trim(_toString(iconRaw));
    const streamIcon = _isEmpty(iconTrimmed) ? null : iconTrimmed;
    const ratingRaw = row.rating ?? row.rating_5based ?? "0";
    const rating = _trim(_toString(ratingRaw)) || "0";
    const plotRaw = row.plot ?? row.description ?? "";
    const plotTrimmed = _trim(_toString(plotRaw));
    const description = _isEmpty(plotTrimmed) ? null : plotTrimmed;
    const data = description;
    const ext = resolvedContainerExtension(_toString(row.container_extension));
    const containerExtension = _isEmpty(_trim(ext)) ? null : ext;

    streams.push({
      containerExtension,
      data,
      description,
      fullName,
      name,
      providerCategoryId,
      rating,
      streamIcon,
      streamId,
    });
  }

  return streams;
}

/** Map `get_series` rows to formatted series catalog entries. */
export function xtreamSeriesStreamsFactory(
  rows: XtreamPanelStreamRow[],
): XtreamFormattedSeriesStream[] {
  const streams: XtreamFormattedSeriesStream[] = [];

  for (const row of rows) {
    const streamId = _toNumber(row.series_id ?? row.stream_id ?? row.num);

    if (!Number.isFinite(streamId) || streamId <= 0) {
      continue;
    }

    const providerCategoryId = normalizeProviderCategoryId(row.category_id);
    const nameRaw = row.name ?? row.title ?? "";
    const name = _trim(_toString(nameRaw)) || `Series ${streamId}`;
    const fullNameRaw = row.full_name ?? "";
    const fullNameTrimmed = _trim(_toString(fullNameRaw));
    const fullName = _isEmpty(fullNameTrimmed) ? null : fullNameTrimmed;
    const iconRaw = row.cover ?? row.stream_icon ?? row.cover_big ?? "";
    const iconTrimmed = _trim(_toString(iconRaw));
    const streamIcon = _isEmpty(iconTrimmed) ? null : iconTrimmed;
    const ratingRaw = row.rating ?? row.rating_5based ?? "0";
    const rating = _trim(_toString(ratingRaw)) || "0";
    const plotRaw = row.plot ?? row.description ?? "";
    const plotTrimmed = _trim(_toString(plotRaw));
    const description = _isEmpty(plotTrimmed) ? null : plotTrimmed;
    const data = description;
    const ext = resolvedContainerExtension(_toString(row.container_extension));
    const containerExtension = _isEmpty(_trim(ext)) ? null : ext;

    streams.push({
      containerExtension,
      data,
      description,
      fullName,
      name,
      providerCategoryId,
      rating,
      streamIcon,
      streamId,
    });
  }

  return streams;
}
