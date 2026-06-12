import _isArray from "lodash/isArray";
import _map from "lodash/map";
import _uniq from "lodash/uniq";

import { SYNC_FETCH_MS_FALLBACK, XTREAM_CATALOG_TIMEOUT_MS } from "@/constants/scheduler.constants";
import { outboundAxios } from "@/services/outboundAxios.config";
import {
  xtreamCategoriesForIdsFactory,
  xtreamCategoriesFromPanelFactory,
  xtreamLiveStreamsFactory,
  xtreamSeriesStreamsFactory,
  xtreamVodStreamsFactory,
} from "@/factories/xtreamCatalogSync.factory";
import type {
  FormattedXtreamCatalog,
  XtreamPanelCategoryRow,
  XtreamPanelStreamRow,
  XtreamUserInfoIngress,
} from "@/types/xtreamSync.types";
import type { RoomSyncProgress } from "@/types/room.types";
import type { PrefetchSectorLogEmitter, PrefetchSyncLogFn } from "@/types/prefetchWorker.types";
import { dlog, logError } from "@/utils/debug.utils";
import {
  buildXtreamPlayerApiUrl,
  parseXtreamUserInfoIngress,
  resolveLiveOutputFormatFromAllowedFormats,
} from "@/utils/xtreamMeta.utils";
import {
  computeHybridSlicePercent,
  estimatedPhaseMsFromJobEstimate,
  parseHttpContentLength,
} from "@/utils/syncProgress.utils";

type XtreamFetchProgressSlice = {
  phase: string;
  phaseStart: number;
  phaseWeight: number;
};

type XtreamSectorLogSlice = {
  emitter: PrefetchSectorLogEmitter;
  inProgressLine: string;
  logKey: string;
  sector: string;
  successLine: (count: number) => string;
};

/** Xtream `player_api.php` fetch; response body must be a list array or it becomes `[]`. */
export async function fetchXtreamPlayerApiJson<
  TRow extends XtreamPanelCategoryRow | XtreamPanelStreamRow =
    | XtreamPanelCategoryRow
    | XtreamPanelStreamRow,
>(
  panelBaseUrl: string,
  username: string,
  password: string,
  action: string,
  options?: {
    estimatedSyncMs?: number;
    onProgress?: (progress: RoomSyncProgress) => void;
    progressSlice?: XtreamFetchProgressSlice;
    sectorLog?: XtreamSectorLogSlice;
  },
): Promise<TRow[]> {
  const completeUrl = buildXtreamPlayerApiUrl(panelBaseUrl, username, password);
  const slice = options?.progressSlice;
  const sectorLog = options?.sectorLog;
  const requestStartedAt = Date.now();
  const estimatedPhaseMs =
    slice != null
      ? estimatedPhaseMsFromJobEstimate(
          options?.estimatedSyncMs ?? SYNC_FETCH_MS_FALLBACK,
          slice.phaseWeight,
        )
      : 0;

  if (sectorLog) {
    sectorLog.emitter.inProgress({
      bytesRead: 0,
      bytesTotal: null,
      line: sectorLog.inProgressLine,
      logKey: sectorLog.logKey,
      sector: sectorLog.sector,
    });
  }

  let lastBytesRead = 0;
  let lastBytesTotal: number | null = null;

  const response = await outboundAxios.get<(XtreamPanelCategoryRow | XtreamPanelStreamRow)[]>(
    `${completeUrl}&action=${action}`,
    {
      onDownloadProgress: (event) => {
        const bytesRead = event.loaded;
        const bytesTotal = parseHttpContentLength(event.total);
        lastBytesRead = bytesRead;
        lastBytesTotal = bytesTotal;

        if (sectorLog) {
          sectorLog.emitter.inProgress({
            bytesRead,
            bytesTotal,
            line: sectorLog.inProgressLine,
            logKey: sectorLog.logKey,
            sector: sectorLog.sector,
          });
        }

        if (!slice || !options?.onProgress) {
          return;
        }

        const elapsedMs = Date.now() - requestStartedAt;
        const percent = computeHybridSlicePercent({
          bytesRead,
          bytesTotal,
          elapsedMs,
          estimatedPhaseMs,
          phaseStart: slice.phaseStart,
          phaseWeight: slice.phaseWeight,
        });

        options.onProgress({
          bytesRead,
          bytesTotal,
          percent,
          phase: slice.phase,
        });
      },
      timeout: XTREAM_CATALOG_TIMEOUT_MS,
    },
  );

  const data = response.data;

  if (slice && options?.onProgress) {
    options.onProgress({
      percent: slice.phaseStart + slice.phaseWeight,
      phase: slice.phase,
    });
  }

  if (sectorLog) {
    const count = _isArray(data) ? data.length : 0;

    sectorLog.emitter.success({
      bytesRead: lastBytesRead,
      bytesTotal: lastBytesTotal,
      line: sectorLog.successLine(count),
      logKey: sectorLog.logKey,
      sector: sectorLog.sector,
    });
  }

  if (_isArray(data)) {
    return data as TRow[];
  }

  return [];
}

type XtreamPanelCredentials = {
  panelBaseUrl: string;
  password: string;
  username: string;
};

type XtreamCatalogProgressContext = {
  estimatedSyncMs?: number;
  onProgress?: (progress: RoomSyncProgress) => void;
};

async function assertXtreamCredentialsValid(
  creds: XtreamPanelCredentials,
  onProgress?: (progress: RoomSyncProgress) => void,
  sectorLog?: PrefetchSectorLogEmitter,
): Promise<string> {
  onProgress?.({ percent: 0, phase: "auth" });

  sectorLog?.inProgress({
    bytesRead: 0,
    bytesTotal: null,
    line: "Validating credentials…",
    logKey: "auth:validate",
    sector: "auth",
  });

  const completeUrl = buildXtreamPlayerApiUrl(creds.panelBaseUrl, creds.username, creds.password);

  const response = await outboundAxios.get<XtreamUserInfoIngress | unknown[]>(
    `${completeUrl}&action=get_user_info`,
    {
      timeout: XTREAM_CATALOG_TIMEOUT_MS,
    },
  );
  const parsed = response.data;

  if (Array.isArray(parsed)) {
    sectorLog?.error({
      line: "Invalid username or password",
      logKey: "auth:validate",
      sector: "auth",
    });
    throw new Error("Invalid username or password");
  }

  const ingress = parseXtreamUserInfoIngress(parsed);

  if (!ingress) {
    sectorLog?.error({
      line: "Invalid username or password",
      logKey: "auth:validate",
      sector: "auth",
    });
    throw new Error("Invalid username or password");
  }

  const ui = ingress.user_info;

  if (ui == null || (typeof ui === "object" && ui.auth === 0)) {
    sectorLog?.error({
      line: "Invalid username or password",
      logKey: "auth:validate",
      sector: "auth",
    });
    throw new Error("Invalid username or password");
  }

  sectorLog?.success({
    line: "Credentials valid",
    logKey: "auth:validate",
    sector: "auth",
  });
  onProgress?.({ percent: 5, phase: "auth" });

  return resolveLiveOutputFormatFromAllowedFormats(ui.allowed_output_formats);
}

async function fetchAndFormatLiveTvCatalogSection(
  creds: XtreamPanelCredentials,
  progress?: XtreamCatalogProgressContext,
  sectorLog?: PrefetchSectorLogEmitter,
  liveDefaultContainerExtension?: string,
): Promise<{
  liveCategories: FormattedXtreamCatalog["liveCategories"];
  liveStreams: FormattedXtreamCatalog["liveStreams"];
}> {
  const { panelBaseUrl, password, username } = creds;
  const onProgress = progress?.onProgress;
  const fetchOptions = { estimatedSyncMs: progress?.estimatedSyncMs, onProgress };

  const liveCategoryRows = await fetchXtreamPlayerApiJson<XtreamPanelCategoryRow>(
    panelBaseUrl,
    username,
    password,
    "get_live_categories",
    {
      ...fetchOptions,
      progressSlice: { phase: "live", phaseStart: 5, phaseWeight: 7 },
      sectorLog: sectorLog
        ? {
            emitter: sectorLog,
            inProgressLine: "Fetching Live categories…",
            logKey: "live:categories",
            sector: "live",
            successLine: (count) => {
              return `Live categories: ${count.toLocaleString()}`;
            },
          }
        : undefined,
    },
  );
  const liveCategoriesFromPanel = xtreamCategoriesFromPanelFactory(liveCategoryRows);

  const liveStreamRows = await fetchXtreamPlayerApiJson<XtreamPanelStreamRow>(
    panelBaseUrl,
    username,
    password,
    "get_live_streams",
    {
      ...fetchOptions,
      progressSlice: { phase: "live", phaseStart: 12, phaseWeight: 13 },
      sectorLog: sectorLog
        ? {
            emitter: sectorLog,
            inProgressLine: "Fetching Live streams…",
            logKey: "live:streams",
            sector: "live",
            successLine: (count) => {
              return `Live streams: ${count.toLocaleString()}`;
            },
          }
        : undefined,
    },
  );
  const liveStreams = xtreamLiveStreamsFactory(liveStreamRows, {
    defaultContainerExtension: liveDefaultContainerExtension,
  });
  const liveNeeded = _uniq(_map(liveStreams, (stream) => stream.providerCategoryId));
  const liveCategories = xtreamCategoriesForIdsFactory({
    fromPanel: liveCategoriesFromPanel,
    neededIds: liveNeeded,
    uncategorizedLabel: "Live — Uncategorized",
  });

  onProgress?.({ percent: 25, phase: "live" });

  return { liveCategories, liveStreams };
}

async function fetchAndFormatVodCatalogSection(
  creds: XtreamPanelCredentials,
  progress?: XtreamCatalogProgressContext,
  sectorLog?: PrefetchSectorLogEmitter,
): Promise<{
  movieCategories: FormattedXtreamCatalog["movieCategories"];
  movieStreams: FormattedXtreamCatalog["movieStreams"];
}> {
  const { panelBaseUrl, password, username } = creds;
  const onProgress = progress?.onProgress;
  const fetchOptions = { estimatedSyncMs: progress?.estimatedSyncMs, onProgress };

  const movieCategoryRows = await fetchXtreamPlayerApiJson<XtreamPanelCategoryRow>(
    panelBaseUrl,
    username,
    password,
    "get_vod_categories",
    {
      ...fetchOptions,
      progressSlice: { phase: "vod", phaseStart: 25, phaseWeight: 7 },
      sectorLog: sectorLog
        ? {
            emitter: sectorLog,
            inProgressLine: "Fetching VOD categories…",
            logKey: "vod:categories",
            sector: "vod",
            successLine: (count) => {
              return `VOD categories: ${count.toLocaleString()}`;
            },
          }
        : undefined,
    },
  );
  const movieCategoriesFromPanel = xtreamCategoriesFromPanelFactory(movieCategoryRows);

  const movieStreamRows = await fetchXtreamPlayerApiJson<XtreamPanelStreamRow>(
    panelBaseUrl,
    username,
    password,
    "get_vod_streams",
    {
      ...fetchOptions,
      progressSlice: { phase: "vod", phaseStart: 32, phaseWeight: 18 },
      sectorLog: sectorLog
        ? {
            emitter: sectorLog,
            inProgressLine: "Fetching VOD streams…",
            logKey: "vod:streams",
            sector: "vod",
            successLine: (count) => {
              return `VOD streams: ${count.toLocaleString()}`;
            },
          }
        : undefined,
    },
  );
  const movieStreams = xtreamVodStreamsFactory(movieStreamRows);
  const movieNeeded = _uniq(_map(movieStreams, (stream) => stream.providerCategoryId));
  const movieCategories = xtreamCategoriesForIdsFactory({
    fromPanel: movieCategoriesFromPanel,
    neededIds: movieNeeded,
    uncategorizedLabel: "VOD — Uncategorized",
  });

  onProgress?.({ percent: 50, phase: "vod" });

  return { movieCategories, movieStreams };
}

async function fetchAndFormatSeriesCatalogSection(
  creds: XtreamPanelCredentials,
  progress?: XtreamCatalogProgressContext,
  sectorLog?: PrefetchSectorLogEmitter,
): Promise<{
  seriesCategories: FormattedXtreamCatalog["seriesCategories"];
  seriesStreams: FormattedXtreamCatalog["seriesStreams"];
}> {
  const { panelBaseUrl, password, username } = creds;
  const onProgress = progress?.onProgress;
  const fetchOptions = { estimatedSyncMs: progress?.estimatedSyncMs, onProgress };

  const seriesCategoryRows = await fetchXtreamPlayerApiJson<XtreamPanelCategoryRow>(
    panelBaseUrl,
    username,
    password,
    "get_series_categories",
    {
      ...fetchOptions,
      progressSlice: { phase: "series", phaseStart: 50, phaseWeight: 7 },
      sectorLog: sectorLog
        ? {
            emitter: sectorLog,
            inProgressLine: "Fetching Series categories…",
            logKey: "series:categories",
            sector: "series",
            successLine: (count) => {
              return `Series categories: ${count.toLocaleString()}`;
            },
          }
        : undefined,
    },
  );
  const seriesCategoriesFromPanel = xtreamCategoriesFromPanelFactory(seriesCategoryRows);

  const seriesListRows = await fetchXtreamPlayerApiJson<XtreamPanelStreamRow>(
    panelBaseUrl,
    username,
    password,
    "get_series",
    {
      ...fetchOptions,
      progressSlice: { phase: "series", phaseStart: 57, phaseWeight: 18 },
      sectorLog: sectorLog
        ? {
            emitter: sectorLog,
            inProgressLine: "Fetching Series…",
            logKey: "series:streams",
            sector: "series",
            successLine: (count) => {
              return `Series: ${count.toLocaleString()}`;
            },
          }
        : undefined,
    },
  );
  const seriesStreams = xtreamSeriesStreamsFactory(seriesListRows);
  const seriesNeeded = _uniq(_map(seriesStreams, (stream) => stream.providerCategoryId));
  const seriesCategories = xtreamCategoriesForIdsFactory({
    fromPanel: seriesCategoriesFromPanel,
    neededIds: seriesNeeded,
    uncategorizedLabel: "Series — Uncategorized",
  });

  onProgress?.({ percent: 75, phase: "series" });

  return {
    seriesCategories,
    seriesStreams,
  };
}

/**
 * Fetches Xtream panel lists (Phase A), normalizes rows, and returns structures ready for `runXtreamCatalogReplace`.
 */
export async function fetchXtreamCatalogForSync(params: {
  estimatedSyncMs?: number;
  log?: PrefetchSyncLogFn;
  onProgress?: (progress: RoomSyncProgress) => void;
  panelBaseUrl: string;
  password: string;
  sectorLog?: PrefetchSectorLogEmitter;
  username: string;
}): Promise<FormattedXtreamCatalog> {
  try {
    const creds: XtreamPanelCredentials = {
      panelBaseUrl: params.panelBaseUrl,
      password: params.password,
      username: params.username,
    };

    const log = params.log;
    const sectorLog = params.sectorLog;
    const progressCtx: XtreamCatalogProgressContext = {
      estimatedSyncMs: params.estimatedSyncMs,
      onProgress: params.onProgress,
    };

    const liveDefaultExtension = await assertXtreamCredentialsValid(
      creds,
      params.onProgress,
      sectorLog,
    );

    const liveTv = await fetchAndFormatLiveTvCatalogSection(
      creds,
      progressCtx,
      sectorLog,
      liveDefaultExtension,
    );
    const vod = await fetchAndFormatVodCatalogSection(creds, progressCtx, sectorLog);
    let series: Awaited<ReturnType<typeof fetchAndFormatSeriesCatalogSection>>;

    try {
      series = await fetchAndFormatSeriesCatalogSection(creds, progressCtx, sectorLog);
    } catch (err) {
      const message = err instanceof Error ? err.message : "series_fetch_failed";
      log?.(`Series fetch failed (${message})`, "error");
      sectorLog?.error({
        line: `Series fetch failed (${message})`,
        logKey: "series:streams",
        sector: "series",
      });
      throw err;
    }

    params.onProgress?.({ percent: 85, phase: "db" });

    return {
      liveCategories: liveTv.liveCategories,
      liveStreams: liveTv.liveStreams,
      movieCategories: vod.movieCategories,
      movieStreams: vod.movieStreams,
      seriesCategories: series.seriesCategories,
      seriesStreams: series.seriesStreams,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "xtream_catalog_unknown_error";
    logError("Xtream catalog", "fetch or format failed", params.panelBaseUrl, message, err);
    dlog("Xtream catalog: fetch or format failed", params.panelBaseUrl, err);
    throw err;
  }
}
