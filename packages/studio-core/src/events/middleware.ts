import type { StudioEvent } from "./types";

// ── Middleware Events ──────────────────────────────────────────────────────────

export interface MiddlewareEnterEvent extends StudioEvent {
  type: "middleware:enter";
  requestId: string;
  name: string;
  index: number;
  totalCount: number;
  /** Declared phase: "before" | "after" | "wrap" */
  phase: string;
}

export interface MiddlewareExitEvent extends StudioEvent {
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

export interface MiddlewareErrorEvent extends StudioEvent {
  type: "middleware:error";
  requestId: string;
  name: string;
  index: number;
  phase: string;
  error: string;
}
