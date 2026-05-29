import { XTREAM_META_TIMEOUT_MS } from "@/constants/scheduler.constants";
import { outboundAxios } from "@/services/outboundAxios.config";
import type { XtremeMoviePayload, XtremeSeriesPayload } from "@/types/xtremeMeta.types";
import { getXtremeCompleteBaseUrl } from "@/utils/common.utils";
import { dlog, logError } from "@/utils/debug.utils";
import { OutboundProviderUrlError } from "@/utils/outboundUrl.utils";

export async function fetchXtremeVodInfo(
  xtreamApiBaseUrl: string,
  username: string,
  password: string,
  vodId: string,
): Promise<XtremeMoviePayload | Record<string, never>> {
  try {
    const completeUrl = getXtremeCompleteBaseUrl(xtreamApiBaseUrl, username, password);
    const { data: meta } = await outboundAxios.get(
      `${completeUrl}&action=get_vod_info&vod_id=${vodId}`,
      {
        timeout: XTREAM_META_TIMEOUT_MS,
      },
    );

    return meta;
  } catch (error) {
    if (error instanceof OutboundProviderUrlError) {
      throw error;
    }

    logError("xtream meta", "Failed to get movie meta", error);
    dlog("[META FETCH] Failed to get movie meta", error);

    return {};
  }
}

export async function fetchXtremeSeriesInfo(
  xtreamApiBaseUrl: string,
  username: string,
  password: string,
  seriesId: string,
): Promise<XtremeSeriesPayload | Record<string, never>> {
  try {
    const completeUrl = getXtremeCompleteBaseUrl(xtreamApiBaseUrl, username, password);
    const { data: meta } = await outboundAxios.get(
      `${completeUrl}&action=get_series_info&series_id=${seriesId}`,
      { timeout: XTREAM_META_TIMEOUT_MS },
    );

    return meta;
  } catch (error) {
    if (error instanceof OutboundProviderUrlError) {
      throw error;
    }

    logError("xtream meta", "Failed to get series meta", error);
    dlog("[META FETCH] Failed to get series meta", error);

    return {};
  }
}
