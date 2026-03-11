import type { DevToolsEvent } from "./types";

// ── Middleware Events ──────────────────────────────────────────────────────────

export interface MiddlewareEnterEvent extends DevToolsEvent {
  type: "middleware:enter";
  requestId: string;
  name: string;
  index: number;
  totalCount: number;
}

export interface MiddlewareExitEvent extends DevToolsEvent {
  type: "middleware:exit";
  requestId: string;
  name: string;
  index: number;
  duration: number;
}

export interface MiddlewareErrorEvent extends DevToolsEvent {
  type: "middleware:error";
  requestId: string;
  name: string;
  index: number;
  error: string;
}
