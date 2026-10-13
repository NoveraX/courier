import { createLogger } from "../logger";
import { checkResponse } from "../realtime/check-response";
import { describeFailure } from "../realtime/describe-failure";
import { sseEventOf } from "../realtime/implementation";
import { streamLabel } from "../realtime/stream-label";
import type { SSEContext } from "../realtime/types";
import { abortableEvents } from "../utils/abortable-events";
import { anySignal } from "../utils/any-signal";
import { SSE_HEARTBEAT } from "./format-sse";
import { LIMITS } from "./limits";
import { createSSESender } from "./sse-sender";
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
  handler: (ctx: SSEContext) => AsyncIterable<unknown>,
  ctx: SSEContext,
  opts: SSEStreamOptions,
): ReadableStream<Uint8Array> {
  // Own controller for force-abort from registry (disconnect/shutdown)
  const forceAbort = new AbortController();
  const combinedSignal = anySignal([ctx.signal, forceAbort.signal]);
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let closeReason: SSECloseReason = "disconnect";
  let registered = false;
  // In-process Studio Playground abort hook — populated only when the
  // request carries a `x-courier-playground-rid` header AND the caller passed
  // `registerPlaygroundAbort`. Cleared in the finally branch.
  let unregisterPlaygroundAbort: (() => void) | undefined;

  const recorded = (bytes: number | false): boolean => {
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
          send: (event) => recorded(sender.broadcast(event)),
          notify: (frame) => sender.notice(frame),
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
          const { responseSchema } = opts;
          const label = streamLabel(opts);
          for await (const value of abortableEvents(generator, combinedSignal)) {
            const yielded = sseEventOf(value, label);
            const event = responseSchema
              ? { ...yielded, data: await checkResponse(responseSchema, yielded.data) }
              : yielded;
            await waitForRoom(sender, combinedSignal);
            if (combinedSignal.aborted || !recorded(sender.send(event))) continue;
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
        /* The reader stopped — its client left. The stream's work stops with
           it whatever the request's own signal says: a host may let go of its
           request, and then that signal never fires, leaving a stream relayed
           from another server open for nobody. */
        forceAbort.abort();
        runCleanupStep("unregisterPlaygroundAbort", unregisterPlaygroundAbort);
        runCleanupStep("clearHeartbeat", () => clearInterval(heartbeatTimer));
        runCleanupStep("cleanupSSEStream", () =>
          cleanupSSEStream(undefined, opts, closeReason, registered),
        );
      },
    },
    /* Sized in bytes: a one-chunk queue would count a healthy client that
       is a burst behind as one that stopped reading. Written out rather than
       as a ByteLengthQueuingStrategy, which the Edge Runtime does not have. */
    { highWaterMark: LIMITS.SSE_MAX_BUFFERED_BYTES, size: (chunk) => chunk.byteLength },
  );
}
