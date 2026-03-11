import type { DevToolsEvent } from "./types";

// ── Cache Events ──────────────────────────────────────────────────────────────

export interface CacheHitEvent extends DevToolsEvent {
  type: "cache:hit";
  requestId: string;
  key: string;
  age: number;
}

export interface CacheMissEvent extends DevToolsEvent {
  type: "cache:miss";
  requestId: string;
  key: string;
}

export interface CacheStoreEvent extends DevToolsEvent {
  type: "cache:store";
  requestId: string;
  key: string;
  ttl: number;
}

export interface CacheInvalidateEvent extends DevToolsEvent {
  type: "cache:invalidate";
  key: string;
  reason: string;
}
