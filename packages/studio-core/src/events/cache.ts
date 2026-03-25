import type { StudioEvent } from "./types";

// ── Cache Events ──────────────────────────────────────────────────────────────

export interface CacheHitEvent extends StudioEvent {
  type: "cache:hit";
  requestId: string;
  key: string;
  age: number;
}

export interface CacheMissEvent extends StudioEvent {
  type: "cache:miss";
  requestId: string;
  key: string;
}

export interface CacheStoreEvent extends StudioEvent {
  type: "cache:store";
  requestId: string;
  key: string;
  ttl: number;
}

export interface CacheInvalidateEvent extends StudioEvent {
  type: "cache:invalidate";
  key: string;
  reason: string;
}
