import type { StudioEvent } from "./types";

// ── Upload Events ─────────────────────────────────────────────────────────────

export interface UploadProgressEvent extends StudioEvent {
  type: "upload:progress";
  requestId: string;
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadCompleteEvent extends StudioEvent {
  type: "upload:complete";
  requestId: string;
}
