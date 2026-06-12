import { ID_PREFIX } from "@/constants/stream.constants";
import type { ParsedStremioStreamId } from "@/types/stream.types";
import _isEmpty from "lodash/isEmpty";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import { decodeToken, encodeToken } from "./crypto.utils";

/**
 * Encodes catalog / meta / video payload for Stremio ids (see `ID_PREFIX`).
 * Uses full `encodeToken` output (variable length) so `{ id, stream_id, video_id }` fits reliably.
 */
export function encodeStremioIdPayload({ id, stream_id, video_id }: ParsedStremioStreamId): string {
  return encodeToken({
    id: _trim(_toString(id)),
    stream_id: _trim(_toString(stream_id)),
    ...(video_id ? { video_id: _trim(_toString(video_id)) } : {}),
  });
}

export function decodeStremioIdPayload(prefixedId: string): ParsedStremioStreamId {
  const rawToken = prefixedId.replace(ID_PREFIX, "");
  const payload = decodeToken<ParsedStremioStreamId>(rawToken);

  return payload ?? { id: "", stream_id: "", video_id: "" };
}
