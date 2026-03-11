import type { DevToolsEvent, SourceMap } from "./types";

// ── Connection Events ──────────────────────────────────────────────────────────

export interface ConnectionInitEvent extends DevToolsEvent {
  type: "connection:init";
  framework: string;
  nexusVersion: string;
  sources: SourceMap;
}

export interface ConnectionHeartbeatEvent extends DevToolsEvent {
  type: "connection:heartbeat";
}

export interface ConnectionSourcesEvent extends DevToolsEvent {
  type: "connection:sources";
  sources: SourceMap;
}
