import type { DevToolsEvent } from "./types";

// ── Upload Events ─────────────────────────────────────────────────────────────

export interface UploadProgressEvent extends DevToolsEvent {
  type: "upload:progress";
  requestId: string;
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadCompleteEvent extends DevToolsEvent {
  type: "upload:complete";
  requestId: string;
}
