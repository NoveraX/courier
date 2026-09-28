import type { SSEEvent, SSESubscription } from "@noverax/courier/realtime";

/**
 * Read a subscription to its end, handing over each event, and the error
 * it failed with, if it did.
 *
 * @param sub - The subscription to read
 * @param receive - Called with every event, in order
 * @param fail - Called once, with the failure as an `Error`, if the stream fails
 * @returns A promise that settles when the stream has ended either way
 * @example
 * void consumeStream(subscribe("live", "ticks"), (event) => log(event.data), report);
 */
export async function consumeStream<TData>(
  sub: SSESubscription<unknown>,
  receive: (event: SSEEvent<TData>) => void,
  fail: (error: Error) => void,
): Promise<void> {
  try {
    for await (const event of sub) receive(event as SSEEvent<TData>);
  } catch (error) {
    fail(toError(error));
  }
}

/**
 * Whatever was thrown, as an `Error`.
 *
 * @param error - A thrown value
 * @returns The value if it is an `Error`, else an `Error` carrying its text
 * @example
 * toError("boom").message; // "boom"
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
