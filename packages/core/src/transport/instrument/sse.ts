import type { SSEEvent, SSESubscription } from "../../realtime/types";
import { beginStream, type StreamInstrumentation, type StreamMeta } from "./core";

/**
 * Wrap an SSESubscription with browser-side studio instrumentation.
 * Returns the original subscription unchanged when studio hooks are not
 * installed — true zero-cost when studio is disconnected.
 *
 * Lifecycle reasons:
 * - `complete` — iterator finished naturally (server closed stream cleanly)
 * - `disconnect` — consumer called `.close()` or broke out of the iterator
 * - `error` — iterator threw or .next() rejected
 */
export function instrumentSSE<TData>(
  subscription: SSESubscription<TData>,
  meta: StreamMeta,
  existingInstr?: StreamInstrumentation | null,
): SSESubscription<TData> {
  const instr = existingInstr ?? beginStream(meta);
  if (!instr) return subscription;

  const originalIterator = subscription[Symbol.asyncIterator].bind(subscription);
  const originalClose = subscription.close.bind(subscription);

  return {
    [Symbol.asyncIterator](): AsyncIterableIterator<SSEEvent<TData>> {
      const iter = originalIterator();
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          try {
            const result = await iter.next();
            if (result.done) {
              instr.emitClose("complete");
            } else {
              // Preserve the user-set SSE `event:` field if present;
              // otherwise default to `"data"` (server→client).
              instr.emitMessage(result.value.data, result.value.event);
            }
            return result;
          } catch (error) {
            instr.emitError(error);
            throw error;
          }
        },
        async return(value?: unknown) {
          instr.emitClose("disconnect");
          return iter.return
            ? iter.return(value as SSEEvent<TData> | undefined)
            : { value: undefined, done: true };
        },
        async throw(error?: unknown) {
          instr.emitError(error);
          if (iter.throw) return iter.throw(error);
          throw error;
        },
      };
    },
    close() {
      instr.emitClose("disconnect");
      originalClose();
    },
    get status() {
      return subscription.status;
    },
    get dropped() {
      return subscription.dropped;
    },
    on(event, handler) {
      return subscription.on(event, handler);
    },
  };
}
