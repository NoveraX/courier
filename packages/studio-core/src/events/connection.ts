import type { SourceMap, StudioEvent } from "./types";

// ── Connection Events ──────────────────────────────────────────────────────────

export interface ConnectionInitEvent extends StudioEvent {
  type: "connection:init";
  framework: string;
  nexusVersion: string;
  sources: SourceMap;
  env?: Record<string, string>;
}

export interface ConnectionHeartbeatEvent extends StudioEvent {
  type: "connection:heartbeat";
}

export interface ConnectionSourcesEvent extends StudioEvent {
  type: "connection:sources";
  sources: SourceMap;
  env?: Record<string, string>;
}
