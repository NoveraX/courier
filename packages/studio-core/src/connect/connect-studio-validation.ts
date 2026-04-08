import type { ConnectStudioOptions } from "./types";

/**
 * Compare two ConnectStudioOptions for fields that, if changed, would
 * meaningfully alter the existing connection's behavior. Drift in any of
 * these would normally require a `disconnect()` + reconnect to take effect.
 * `nexusVersion` and `sourceMap` are excluded — they are diagnostic
 * metadata, not behavior-affecting.
 */
export function hasOptionDrift(prev: ConnectStudioOptions, next: ConnectStudioOptions): boolean {
  if ((prev.port ?? 4380) !== (next.port ?? 4380)) return true;
  if ((prev.host ?? "localhost") !== (next.host ?? "localhost")) return true;
  if ((prev.framework ?? "unknown") !== (next.framework ?? "unknown")) return true;
  if (prev.appOrigin !== next.appOrigin) return true;
  if (prev.maxBufferSize !== next.maxBufferSize) return true;
  if (JSON.stringify(prev.filter ?? null) !== JSON.stringify(next.filter ?? null)) return true;
  return false;
}

/**
 * Generate a session identifier. Uses `crypto.randomUUID()` when available
 * (modern browsers, Node ≥14.17), otherwise falls back to a timestamp +
 * random combination. Sessions are not security-sensitive, but UUID
 * dramatically reduces collision risk under high reconnect churn.
 */
export function generateSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
