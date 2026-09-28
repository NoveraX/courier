import type { StudioEvent } from "./types";

// ── Upload Events ─────────────────────────────────────────────────────────────

export interface UploadProgressEvent extends StudioEvent {
  type: "upload:progress";
  requestId: string;
  /** The endpoint the upload is for, when the caller knows it. */
  source?: string;
  group?: string;
  method?: string;
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadCompleteEvent extends StudioEvent {
  type: "upload:complete";
  requestId: string;
}
