import type { SSERegistryEntry } from "./sse-registry";
import type { SSEBroadcastEvent, SSEBroadcastResult } from "./sse-types";

/** Shared broadcast delivery for the SSE registry */
export interface SSEBroadcastEngine {
  /** Send an event to matching entries, returning whether each took it */
  deliver(iter: Iterable<SSERegistryEntry>, event: SSEBroadcastEvent): SSEBroadcastResult;
}

/**
 * Create a broadcast engine for SSE server-initiated push.
 *
 * Each stream writes the event itself: it carries only an id of its own, so
 * a client resumes from where the stream's generator left it; and a stream
 * whose client is not reading refuses the event rather than queueing it.
 *
 * @param entries - Live registry entries map (read-only reference for liveness checks)
 */
export function createBroadcastEngine(entries: Map<string, SSERegistryEntry>): SSEBroadcastEngine {
  function deliver(iter: Iterable<SSERegistryEntry>, event: SSEBroadcastEvent): SSEBroadcastResult {
    const result: SSEBroadcastResult = new Map();
    for (const entry of iter) {
      const ok = entries.has(entry.connectionId) && entry.send(event);
      result.set(entry.connectionId, ok);
    }
    return result;
  }

  return { deliver };
}
