import type { Redis } from "ioredis";

/** Starts and stops passing a client's errors to an adapter's handlers */
export interface ErrorForwarder {
  /** Listen to the client's errors; again is a no-op */
  start(): void;
  /** Stop listening */
  stop(): void;
}

/**
 * Pass a Redis client's errors to an adapter's error handlers through one
 * listener, which `stop()` removes.
 *
 * Adapters used to add a listener per `onError` call and never remove it on
 * disconnect: a shut-down adapter still called its handlers, and an app that
 * built adapters per tenant or on reconnect piled listeners up until Node
 * warned of a leak.
 *
 * @param redis - The client whose errors to forward
 * @param handlers - The adapter's error handlers, read at each error
 * @returns `start` and `stop`
 */
export function createErrorForwarder(
  redis: Pick<Redis, "on" | "off">,
  handlers: ReadonlySet<(error: Error) => void>,
): ErrorForwarder {
  const forward = (err: Error): void => {
    for (const handler of handlers) handler(err);
  };
  let listening = false;
  return {
    start() {
      if (listening) return;
      redis.on("error", forward);
      listening = true;
    },
    stop() {
      redis.off("error", forward);
      listening = false;
    },
  };
}
