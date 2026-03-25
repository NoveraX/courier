import type { StudioEvent } from "./types";

// ── Deduplication Events ──────────────────────────────────────────────────────

export interface DedupAbortEvent extends StudioEvent {
  type: "dedup:abort";
  requestId: string;
  key: string;
}

export interface DedupReuseEvent extends StudioEvent {
  type: "dedup:reuse";
  requestId: string;
  key: string;
}
