import type { DevToolsEvent } from "./types";

// ── Middleware Events ──────────────────────────────────────────────────────────

export interface MiddlewareEnterEvent extends DevToolsEvent {
  type: "middleware:enter";
  requestId: string;
  name: string;
  index: number;
  totalCount: number;
  /** Declared phase: "before" | "after" | "wrap" */
  phase: string;
}

export interface MiddlewareExitEvent extends DevToolsEvent {
  type: "middleware:exit";
  requestId: string;
  name: string;
  index: number;
  duration: number;
  /** Declared phase: "before" | "after" | "wrap" */
  phase: string;
  /** Time spent before calling next() */
  beforeDuration: number;
  /** Time spent after next() returned */
  afterDuration: number;
  /** Header names added by this middleware */
  headersAdded: string[];
}

export interface MiddlewareErrorEvent extends DevToolsEvent {
  type: "middleware:error";
  requestId: string;
  name: string;
  index: number;
  phase: string;
  error: string;
}
