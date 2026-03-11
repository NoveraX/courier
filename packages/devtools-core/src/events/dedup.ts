import type { DevToolsEvent } from "./types";

// ── Deduplication Events ──────────────────────────────────────────────────────

export interface DedupAbortEvent extends DevToolsEvent {
  type: "dedup:abort";
  requestId: string;
  key: string;
}

export interface DedupReuseEvent extends DevToolsEvent {
  type: "dedup:reuse";
  requestId: string;
  key: string;
}
