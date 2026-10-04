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
 * One listener, removed on disconnect, so a shut-down adapter calls no
 * handler and an app that builds adapters per tenant or on reconnect does not
 * pile listeners up until Node warns of a leak.
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
