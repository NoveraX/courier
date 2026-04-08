import type { StudioHooks } from "../studio/hooks";
import type { SSEStreamOptions } from "./sse-stream";
import type { SSECloseReason } from "./sse-types";

/** Best-effort enqueue — returns false if stream already closed */
export function safeSend(
  controller: ReadableStreamDefaultController<Uint8Array>,
  chunk: Uint8Array,
): boolean {
  try {
    controller.enqueue(chunk);
    return true;
  } catch {
    return false;
  }
}

/**
 * Unregister from registry + fire lifecycle/studio hooks.
 *
 * Idempotent across the start()/cancel() race: if a concurrent caller has
 * already removed the registry entry, `info` is undefined and we skip the
 * hook firing entirely. The controller is still flushed because closing it
 * twice is harmless. Without this guard, both `start()`'s finally and
 * `cancel()` would observe `registered=true` (a closure-captured boolean
 * the outer scope can't mutate) and double-fire onStreamClose / onDisconnect.
 */
export function cleanupSSEStream(
  controller: ReadableStreamDefaultController<Uint8Array> | undefined,
  opts: SSEStreamOptions,
  reason: SSECloseReason,
  registered: boolean,
): void {
  if (registered) {
    const info = opts.registry.get(opts.connectionId);
    if (info) {
      opts.registry.remove(opts.connectionId);

      const finalReason = resolveCloseReason(reason, opts);

      emitClose(opts.dt, opts.requestId, finalReason, info.eventCount, info.totalBytes, opts.t0);

      opts.onDisconnect?.({
        connectionId: opts.connectionId,
        meta: opts.meta,
        reason: finalReason,
        eventCount: info.eventCount,
        totalBytes: info.totalBytes,
        duration: performance.now() - opts.t0,
      });
    }
  }

  try {
    controller?.close();
  } catch {
    // Already closed — expected during concurrent disconnect/shutdown
  }
}

/** Determine the final close reason — shutdown and TTL override generic "disconnect" */
function resolveCloseReason(reason: SSECloseReason, opts: SSEStreamOptions): SSECloseReason {
  if (opts.registry.isShuttingDown) return "shutdown";
  if (reason === "disconnect" && opts.ttlSignal?.aborted) return "max_lifetime";
  return reason;
}

/** Emit studio onStreamClose hook */
export function emitClose(
  dt: StudioHooks,
  requestId: string,
  reason: SSECloseReason,
  eventCount: number,
  totalBytes: number,
  t0: number,
): void {
  dt.onStreamClose?.({
    requestId,
    reason,
    eventCount,
    totalBytes,
    duration: performance.now() - t0,
    timestamp: Date.now(),
  });
}

export function formatErrorEvent(message: string): string {
  return `event: error\ndata: ${JSON.stringify({ message })}\n\n`;
}
