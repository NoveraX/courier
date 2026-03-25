import type { StudioEvent } from "./types";

// ── Proxy Events ──────────────────────────────────────────────────────────────

export interface ProxyReceiveEvent extends StudioEvent {
  type: "proxy:receive";
  proxyMethod: "GET" | "POST";
  source: string;
  group: string | undefined;
  method: string;
}

export interface ProxyParseEvent extends StudioEvent {
  type: "proxy:parse";
  source: string;
  group: string | undefined;
  method: string;
  variables: unknown;
}

export interface ProxyOriginRejectEvent extends StudioEvent {
  type: "proxy:origin-reject";
  origin: string;
  allowedOrigins: string[];
}

export interface ProxyRespondEvent extends StudioEvent {
  type: "proxy:respond";
  proxyMethod: "GET" | "POST";
  source: string;
  group: string | undefined;
  method: string;
  status: number;
}
