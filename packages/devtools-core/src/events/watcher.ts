// ── File Watcher Events ──────────────────────────────────────────────────────
// These are standalone socket events (like scan:updated), not DevToolsEvent
// envelope events — they don't go through the EventBus instrumentation layer.

/** Sent on UI connection — current watcher state */
export interface WatcherStatusEvent {
  apiPaths: number;
  mockFiles: number;
  timestamp: number;
}

/** Sent on each file change (debounced by source watcher) */
export interface WatcherChangeEvent {
  source: "api" | "mock";
  files: string[];
  timestamp: number;
}
