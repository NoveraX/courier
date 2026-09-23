import { createLogger } from "../logger";
import { describeFailure } from "../realtime/describe-failure";
import type { SSEContext, SSEEvent, SSEHandler } from "../realtime/types";
import { abortableEvents } from "../utils/abortable-events";
import { SSE_HEARTBEAT } from "./format-sse";
import { LIMITS } from "./limits";
import { createSSESender, type SSESender } from "./sse-sender";
import {
  cleanupSSEStream,
  formatStreamEnd,
  runCleanupStep,
  safeSend,
  truncatePreview,
  waitForRoom,
} from "./sse-stream-lifecycle";
import type { SSECloseReason, SSEStreamOptions } from "./sse-types";

const log = createLogger("SSE");
const HEARTBEAT_INTERVAL = 25_000;
const SSE_ENCODER = new TextEncoder();

/**
 * Create a ReadableStream from an SSE async generator handler.
 * Registers with the SSE connection registry for lifecycle tracking.
 */
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
          for await (const event of abortableEvents(generator, combinedSignal)) {
            await waitForRoom(sender, combinedSignal);
            if (combinedSignal.aborted || !writeEvent(sender, event, false)) continue;
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
          }
          if (!combinedSignal.aborted) {
            closeReason = "complete";
            safeSend(controller, SSE_ENCODER.encode(formatStreamEnd()));
          }
        } catch (error) {
          closeReason = "error";
          if (!combinedSignal.aborted) {
            log.warn("Stream handler failed", error);
            const failure = describeFailure(error, "Stream failed");
            safeSend(controller, SSE_ENCODER.encode(formatStreamEnd(failure)));
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
