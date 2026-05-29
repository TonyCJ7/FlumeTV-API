import _toNumber from "lodash/toNumber";
import _toString from "lodash/toString";
import { ContentType, MetaPreview } from "stremio-addon-sdk";

import { ID_PREFIX } from "@/constants/stream.constants";
import { Stream } from "@/types/stream.types";
import { encodeStremioIdPayload } from "@/utils/builder.utils";
import { firstValidImageUrl } from "@/utils/metaDetails.utils";

export function metaPreviewFactory(stream: Stream, type: ContentType): MetaPreview {
  const ratingString = _toString(stream.rating ?? "");
  const ratingAsNumber = _toNumber(ratingString);
  const posterUrl = firstValidImageUrl(stream.stream_icon);
  const previewEncoded = encodeStremioIdPayload({
    id: _toString(stream.id),
    stream_id: _toString(stream.stream_id),
  });
  const previewId = `${ID_PREFIX}${previewEncoded}`;

  return {
    id: previewId,
    type,
    name: stream.name,
    ...(posterUrl ? { poster: posterUrl } : {}),
    ...(ratingAsNumber > 0 ? { imdbRating: ratingString } : {}),
  } as MetaPreview;
}
