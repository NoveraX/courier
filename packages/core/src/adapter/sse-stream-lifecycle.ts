import { createLogger } from "../logger";
import type { StreamFailure } from "../realtime/describe-failure";
import { SSE_CONTROL_EVENTS } from "../realtime/sse/control-events";
import type { StudioHooks } from "../studio/hooks";
import type { SSESender } from "./sse-sender";
import type { SSECloseReason, SSEStreamOptions } from "./sse-types";

const log = createLogger("SSE");

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

/**
 * The event that tells the client how a stream ended: finished, or failed
 * with what it may read about the failure. Either way it does not reconnect.
 */
export function formatStreamEnd(failure?: StreamFailure): string {
  if (!failure) return `event: ${SSE_CONTROL_EVENTS.complete}\ndata: null\n\n`;
  return `event: ${SSE_CONTROL_EVENTS.error}\ndata: ${JSON.stringify(failure)}\n\n`;
}

const PREVIEW_MAX = 512;

/** Produce a short JSON preview of stream event data */
export function truncatePreview(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined;
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return str.length <= PREVIEW_MAX ? str : `${str.slice(0, PREVIEW_MAX)}…`;
}

/**
 * Run a single cleanup step in isolation. Throws are swallowed so a failure
 * in one step (e.g. `unregisterPlaygroundAbort` blowing up because the
 * registry entry was already removed) cannot skip the remaining steps and
 * leak the heartbeat interval or the registry entry. The cleanup chain MUST
 * complete every link even when one of them throws.
 *
 * Cleanup callbacks must be synchronous — `runCleanupStep` does not await
 * returned promises, so an async failure would land in an unhandled
 * rejection rather than the warn-and-continue path. Failures are surfaced
 * via `log.warn` so a silently broken cleanup leaves a trace in the studio
 * log instead of vanishing.
 */
export function runCleanupStep(label: string, step: (() => void) | undefined): void {
  if (!step) return;
  try {
    step();
  } catch (error) {
    log.warn(`SSE cleanup step "${label}" failed`, error);
  }
}

const ROOM_POLL_MS = 50;

/** Wait `ms`, or less if `signal` aborts, leaving no listener behind either way. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Wait until the client has read enough for the next event, or the stream
 * closes. A client that stops reading may hold a stream here for its whole
 * lifetime, so each poll takes its abort listener back with it.
 *
 * @param sender - The stream's writer, which knows how full its buffer is
 * @param signal - Aborts when the stream closes
 * @returns Once there is room, or the stream has closed
 * @example
 * ```ts
 * await waitForRoom(sender, signal);
 * if (!signal.aborted) sender.send(event, false);
 * ```
 */
export async function waitForRoom(sender: SSESender, signal: AbortSignal): Promise<void> {
  while (!sender.hasRoom && !signal.aborted) await pause(ROOM_POLL_MS, signal);
}
