import { createLogger } from "../logger";
import type { SSEContext, SSEEvent, SSEHandler } from "../realtime/types";
import type { StudioHooks } from "../studio/hooks";
import { SSE_HEARTBEAT } from "./format-sse";
import { LIMITS } from "./limits";
import { pumpEvents } from "./sse-pump";
import type { InternalSSERegistry } from "./sse-registry";
import { createSSESender, type SSESender } from "./sse-sender";
import { cleanupSSEStream, formatErrorEvent, safeSend } from "./sse-stream-lifecycle";
import type { SSECloseReason, SSELifecycleConfig } from "./sse-types";

const HEARTBEAT_INTERVAL = 25_000;
const SSE_ENCODER = new TextEncoder();
const log = createLogger("SSE");

/** Options passed from createSSEHandler to createSSEStream */
export interface SSEStreamOptions {
  connectionId: string;
  requestId: string;
  source: string;
  group: string | undefined;
  method: string;
  meta: Record<string, unknown>;
  registry: InternalSSERegistry;
  dt: StudioHooks;
  t0: number;
  /** Separate TTL signal to detect max_lifetime reason (undefined = no TTL) */
  ttlSignal?: AbortSignal;
  onDisconnect?: SSELifecycleConfig["onSSEDisconnect"];
  onError?: SSELifecycleConfig["onSSEError"];
  /**
   * Studio Playground requestId extracted from the `x-courier-playground-rid`
   * request header. When set, the stream registers its `forceAbort.abort`
   * callback in the process-global playground abort registry so the
   * playground executor can force-close it deterministically (Node loopback
   * fetch abort does NOT propagate to `request.signal` synchronously).
   * Undefined for production traffic — registry is a no-op.
   */
  playgroundRid?: string;
  /**
   * Injected `registerPlaygroundAbort` from `../studio` — accepted as a
   * dependency to keep `createSSEStream` decoupled from the singleton import
   * (testability + tree-shaking when Studio is not used).
   */
  registerPlaygroundAbort?: (requestId: string, abort: () => void) => () => void;
}

/**
 * Create a ReadableStream from an SSE async generator handler.
 * Registers with the SSE connection registry for lifecycle tracking.
 */
const PREVIEW_MAX = 512;

/** Produce a short JSON preview of stream event data */
function truncatePreview(data: unknown): string | undefined {
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
function runCleanupStep(label: string, step: (() => void) | undefined): void {
  if (!step) return;
  try {
    step();
  } catch (error) {
    log.warn(`SSE cleanup step "${label}" failed`, error);
  }
}

export function createSSEStream(
  handler: SSEHandler<unknown, unknown>,
  ctx: SSEContext,
  opts: SSEStreamOptions,
): ReadableStream<Uint8Array> {
  // Own controller for force-abort from registry (disconnect/shutdown)
  const forceAbort = new AbortController();
  const combinedSignal = AbortSignal.any([ctx.signal, forceAbort.signal]);
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let closeReason: SSECloseReason = "disconnect";
  let registered = false;
  // In-process Studio Playground abort hook — populated only when the
  // request carries a `x-courier-playground-rid` header AND the caller passed
  // `registerPlaygroundAbort`. Cleared in the finally branch.
  let unregisterPlaygroundAbort: (() => void) | undefined;

  const writeEvent = (sender: SSESender, event: SSEEvent<unknown>, mayDrop: boolean): boolean => {
    const bytes = sender.send(event, mayDrop);
    if (bytes === false) return false;
    opts.registry.recordEvent(opts.connectionId, bytes);
    return true;
  };

  return new ReadableStream(
    {
      async start(controller) {
        const sender = createSSESender(controller, () => {
          closeReason = "slow_consumer";
          forceAbort.abort();
        });
        const accepted = opts.registry.add({
          connectionId: opts.connectionId,
          connectedAt: Date.now(),
          meta: opts.meta,
          source: opts.source,
          group: opts.group,
          method: opts.method,
          eventCount: 0,
          totalBytes: 0,
          lastEventAt: 0,
          abort: () => forceAbort.abort(),
          send: (event, mayDrop) => writeEvent(sender, event, mayDrop),
        });

        if (!accepted) {
          controller.close();
          return;
        }
        registered = true;

        // Register the playground abort hook AFTER the registry add succeeds
        // — so a rejected connection (over-limit) doesn't leave a dangling
        // entry in the playground registry.
        if (opts.playgroundRid && opts.registerPlaygroundAbort) {
          unregisterPlaygroundAbort = opts.registerPlaygroundAbort(opts.playgroundRid, () =>
            forceAbort.abort(),
          );
        }

        combinedSignal.addEventListener("abort", () => clearInterval(heartbeatTimer), {
          once: true,
        });
        heartbeatTimer = setInterval(() => sender.comment(SSE_HEARTBEAT), HEARTBEAT_INTERVAL);

        try {
          const generator = handler({ ...ctx, signal: combinedSignal });
          const outcome = await pumpEvents(generator, combinedSignal, async (event) => {
            await waitForRoom(sender, combinedSignal);
            if (combinedSignal.aborted || !writeEvent(sender, event, false)) return;
            opts.dt.onStreamMessage?.({
              requestId: opts.requestId,
              seq: opts.registry.get(opts.connectionId)?.eventCount ?? 0,
              // Default to "data" (server→client) so the timeline UI renders
              // a downward arrow even when the user did not set an explicit
              // SSE `event:` field.
              eventType: event.event ?? "data",
              dataSize: opts.registry.get(opts.connectionId)?.totalBytes ?? 0,
              dataPreview: truncatePreview(event.data),
              timestamp: Date.now(),
            });
          });
          if (outcome === "complete") closeReason = "complete";
        } catch (error) {
          closeReason = "error";
          if (!combinedSignal.aborted) {
            const msg = error instanceof Error ? error.message : "Unknown stream error";
            safeSend(controller, SSE_ENCODER.encode(formatErrorEvent(msg)));
            opts.onError?.({ connectionId: opts.connectionId, meta: opts.meta, error });
          }
        } finally {
          runCleanupStep("unregisterPlaygroundAbort", unregisterPlaygroundAbort);
          runCleanupStep("clearHeartbeat", () => clearInterval(heartbeatTimer));
          runCleanupStep("cleanupSSEStream", () =>
            cleanupSSEStream(controller, opts, closeReason, registered),
          );
        }
      },
      cancel() {
        runCleanupStep("unregisterPlaygroundAbort", unregisterPlaygroundAbort);
        runCleanupStep("clearHeartbeat", () => clearInterval(heartbeatTimer));
        runCleanupStep("cleanupSSEStream", () =>
          cleanupSSEStream(undefined, opts, closeReason, registered),
        );
      },
    },
    /* Sized in bytes: a one-chunk queue would count a healthy client that
       is a burst behind as one that stopped reading. */
    new ByteLengthQueuingStrategy({
      highWaterMark: LIMITS.SSE_MAX_BUFFERED_BYTES,
    }) as QueuingStrategy<Uint8Array>,
  );
}

/** Wait until the client has read enough for the next event, or the stream closes. */
async function waitForRoom(sender: SSESender, signal: AbortSignal): Promise<void> {
  while (!sender.hasRoom && !signal.aborted) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 50);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
