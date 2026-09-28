import type { StudioEvent } from "./types";

// ── Proxy Events ──────────────────────────────────────────────────────────────

export interface ProxyReceiveEvent extends StudioEvent {
  type: "proxy:receive";
  /** The request the call is shown as, when Studio announced it on arrival. */
  requestId?: string;
  proxyMethod: "GET" | "POST";
  source: string;
  group: string | undefined;
  method: string;
}

export interface ProxyParseEvent extends StudioEvent {
  type: "proxy:parse";
  /** The request the call is shown as, when Studio announced it on arrival. */
  requestId?: string;
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
  /** The request the call is shown as, when Studio announced it on arrival. */
  requestId?: string;
  proxyMethod: "GET" | "POST";
  source: string;
  group: string | undefined;
  method: string;
  status: number;
}
