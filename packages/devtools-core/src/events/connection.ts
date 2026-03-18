import type { DevToolsEvent, SourceMap } from "./types";

// ── Connection Events ──────────────────────────────────────────────────────────

export interface ConnectionInitEvent extends DevToolsEvent {
  type: "connection:init";
  framework: string;
  nexusVersion: string;
  sources: SourceMap;
  env?: Record<string, string>;
}

export interface ConnectionHeartbeatEvent extends DevToolsEvent {
  type: "connection:heartbeat";
}

export interface ConnectionSourcesEvent extends DevToolsEvent {
  type: "connection:sources";
  sources: SourceMap;
  env?: Record<string, string>;
}
