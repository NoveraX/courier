import { createLogger } from "../../logger";
import { RealtimeError } from "../../realtime/errors";
import type { SubscriptionDriver } from "../../realtime/subscription-driver";
import type { StreamEvent } from "../../realtime/subscription-types";

const log = createLogger("Stream");
const INTERNAL_ERROR = 5000;

/**
 * What runs a stream or a push channel served in process: its handler's
 * events, open at once — there is no connection to make — until the handler
 * returns, throws, or the subscription is let go of. Closing ends a reader
 * waiting on the next event at once, even while the handler is parked on an
 * await; the handler hears it through `ctx.signal`.
 *
 * A handler that throws something other than a `RealtimeError` fails the
 * subscription with its message: in process, the caller is the developer's
 * own Playground or page, which a remote client is not.
 *
 * @param events - The handler's events, held to its response schema
 * @param ended - Aborts the handler's `ctx.signal`
 * @returns The driver
 */
export function eventsDriver(
  events: AsyncIterable<StreamEvent<unknown>>,
  ended: AbortController,
): SubscriptionDriver<unknown> {
  return {
    open(sink) {
      sink.open({ resumed: false });
      void (async () => {
        try {
          for await (const event of events) sink.data(event);
          sink.end();
        } catch (error) {
          if (ended.signal.aborted) return;
          log.warn("A stream served in process failed", error);
          sink.end(
            error instanceof RealtimeError
              ? error
              : new RealtimeError(INTERNAL_ERROR, messageOf(error)),
          );
        }
      })();
    },
    /* Served in process: there is no connection to make again. */
    reconnect: () => undefined,
    close: () => ended.abort(),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
