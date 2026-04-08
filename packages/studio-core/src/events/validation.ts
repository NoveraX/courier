import type { StudioEvent } from "./types";

// ── Validation Events ──────────────────────────────────────────────────────────

export interface ValidationStartEvent extends StudioEvent {
  type: "validation:start";
  requestId: string;
  target: "variables" | "response" | "receive";
}

export interface ValidationPassEvent extends StudioEvent {
  type: "validation:pass";
  requestId: string;
  target: "variables" | "response" | "receive";
  duration: number;
}

export interface ValidationFailEvent extends StudioEvent {
  type: "validation:fail";
  requestId: string;
  target: "variables" | "response" | "receive";
  issues: readonly unknown[];
  duration: number;
}
