import type { DevToolsEvent } from "./types";

// ── Validation Events ──────────────────────────────────────────────────────────

export interface ValidationStartEvent extends DevToolsEvent {
  type: "validation:start";
  requestId: string;
  target: "variables" | "response";
}

export interface ValidationPassEvent extends DevToolsEvent {
  type: "validation:pass";
  requestId: string;
  target: "variables" | "response";
  duration: number;
}

export interface ValidationFailEvent extends DevToolsEvent {
  type: "validation:fail";
  requestId: string;
  target: "variables" | "response";
  issues: readonly unknown[];
  duration: number;
}
