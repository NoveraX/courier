import type { StudioEvent } from "./types";

// ── HTTP Events ────────────────────────────────────────────────────────────────

export interface HttpFetchStartEvent extends StudioEvent {
  type: "http:fetch:start";
  requestId: string;
  url: string;
  method: string;
}

/** The HTTP version a request went over, as a protocol's name for it. */
export type HttpVersion = "HTTP/1.0" | "HTTP/1.1" | "HTTP/2" | "HTTP/3";

export interface HttpFetchEndEvent extends StudioEvent {
  type: "http:fetch:end";
  requestId: string;
  status: number;
  duration: number;
  /** The version the request went over, when the runtime could tell. */
  httpVersion?: HttpVersion;
}

export interface HttpFetchErrorEvent extends StudioEvent {
  type: "http:fetch:error";
  requestId: string;
  message: string;
  /** The code the upstream answered with, when the failure is an answer. */
  status?: number;
  /** The version that answer came over, when the runtime could tell. */
  httpVersion?: HttpVersion;
}
