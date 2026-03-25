import type { StudioEvent } from "./types";

// ── Validation Events ──────────────────────────────────────────────────────────

export interface ValidationStartEvent extends StudioEvent {
  type: "validation:start";
  requestId: string;
  target: "variables" | "response";
}

export interface ValidationPassEvent extends StudioEvent {
  type: "validation:pass";
  requestId: string;
  target: "variables" | "response";
  duration: number;
}

export interface ValidationFailEvent extends StudioEvent {
  type: "validation:fail";
  requestId: string;
  target: "variables" | "response";
  issues: readonly unknown[];
  duration: number;
}
