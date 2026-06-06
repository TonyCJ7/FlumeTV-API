import type { RoomLogSectorStatus, RoomLogTone } from "@/types/room.types";

export type PrefetchSyncLogFn = (line: string, tone?: RoomLogTone) => void;

export type PrefetchSectorLogInput = {
  bytesRead?: number;
  bytesTotal?: number | null;
  line: string;
  logKey: string;
  sector: string;
  sectorPercent?: number | null;
  status: RoomLogSectorStatus;
  tone?: RoomLogTone;
};

export type PrefetchSectorLogEmitter = {
  error: (params: {
    bytesRead?: number;
    bytesTotal?: number | null;
    line: string;
    logKey: string;
    sector: string;
  }) => void;
  inProgress: (params: {
    bytesRead?: number;
    bytesTotal?: number | null;
    line: string;
    logKey: string;
    sector: string;
  }) => void;
  success: (params: {
    bytesRead?: number;
    bytesTotal?: number | null;
    line: string;
    logKey: string;
    sector: string;
  }) => void;
};
