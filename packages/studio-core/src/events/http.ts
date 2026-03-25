import type { StudioEvent } from "./types";

// ── HTTP Events ────────────────────────────────────────────────────────────────

export interface HttpFetchStartEvent extends StudioEvent {
  type: "http:fetch:start";
  requestId: string;
  url: string;
  method: string;
}

export interface HttpFetchEndEvent extends StudioEvent {
  type: "http:fetch:end";
  requestId: string;
  status: number;
  duration: number;
}

export interface HttpFetchErrorEvent extends StudioEvent {
  type: "http:fetch:error";
  requestId: string;
  message: string;
}
