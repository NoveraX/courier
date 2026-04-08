import { formatSSEEvent } from "./format-sse";
import type { SSERegistryEntry } from "./sse-registry";
import type { SSEBroadcastEvent, SSEBroadcastResult } from "./sse-types";

/** Shared broadcast state and helpers for SSE registry */
export interface SSEBroadcastEngine {
  /** Encode a broadcast event into SSE wire format bytes */
  encode(event: SSEBroadcastEvent): Uint8Array;
  /** Send encoded chunk to matching entries, returns delivery results */
  deliver(iter: Iterable<SSERegistryEntry>, chunk: Uint8Array): SSEBroadcastResult;
}

/**
 * Create a broadcast engine for SSE server-initiated push.
 * Maintains a monotonic sequence counter for event IDs.
 *
 * @param entries - Live registry entries map (read-only reference for liveness checks)
 */
export function createBroadcastEngine(entries: Map<string, SSERegistryEntry>): SSEBroadcastEngine {
  const encoder = new TextEncoder();
  let broadcastSeq = 0;

  function encode(event: SSEBroadcastEvent): Uint8Array {
    return encoder.encode(formatSSEEvent(event, ++broadcastSeq));
  }

  function deliver(iter: Iterable<SSERegistryEntry>, chunk: Uint8Array): SSEBroadcastResult {
    const result: SSEBroadcastResult = new Map();
    for (const entry of iter) {
      const ok = entries.has(entry.connectionId) && entry.enqueue(chunk);
      result.set(entry.connectionId, ok);
    }
    return result;
  }

  return { encode, deliver };
}
