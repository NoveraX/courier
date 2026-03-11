import type { DevToolsEvent } from "./types";

// ── HTTP Events ────────────────────────────────────────────────────────────────

export interface HttpFetchStartEvent extends DevToolsEvent {
  type: "http:fetch:start";
  requestId: string;
  url: string;
  method: string;
}

export interface HttpFetchEndEvent extends DevToolsEvent {
  type: "http:fetch:end";
  requestId: string;
  status: number;
  duration: number;
}

export interface HttpFetchErrorEvent extends DevToolsEvent {
  type: "http:fetch:error";
  requestId: string;
  message: string;
}
