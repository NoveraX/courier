import type { DevToolsEvent } from "./types";

// ── Proxy Events ──────────────────────────────────────────────────────────────

export interface ProxyReceiveEvent extends DevToolsEvent {
  type: "proxy:receive";
  proxyMethod: "GET" | "POST";
  source: string;
  group: string | undefined;
  method: string;
}

export interface ProxyParseEvent extends DevToolsEvent {
  type: "proxy:parse";
  source: string;
  group: string | undefined;
  method: string;
  variables: unknown;
}

export interface ProxyOriginRejectEvent extends DevToolsEvent {
  type: "proxy:origin-reject";
  origin: string;
  allowedOrigins: string[];
}

export interface ProxyRespondEvent extends DevToolsEvent {
  type: "proxy:respond";
  proxyMethod: "GET" | "POST";
  source: string;
  group: string | undefined;
  method: string;
  status: number;
}
