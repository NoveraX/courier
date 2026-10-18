import { abortReason } from "./abort-reason";

/**
 * An answer whose body fails with the call's own reason when the call stops
 * waiting, as fetch's does: a copy of a shared answer outlives the call that
 * leaves it otherwise.
 *
 * @param response - The answer, or a copy of it no one else reads
 * @param signal - Fires when the call stops waiting
 * @returns The answer, its body cut short when the signal fires
 * @example
 * ```ts
 * waiter.resolve(readUntilLeft(response.clone(), waiter.signal));
 * ```
 */
export function readUntilLeft(response: Response, signal: AbortSignal | undefined): Response {
  const { body } = response;
  /* React Native has no streams, nor a body to cut short. */
  if (signal === undefined || body === null || typeof ReadableStream === "undefined") {
    return response;
  }
  const reader = body.getReader();
  let output: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller;
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (signal.aborted) return;
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason: unknown) {
      return reader.cancel(reason);
    },
  });
  signal.addEventListener(
    "abort",
    () => {
      output?.error(abortReason(signal));
      void reader.cancel(abortReason(signal)).catch(() => undefined);
    },
    { once: true },
  );
  const copy = new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  return Object.defineProperties(copy, {
    url: { value: response.url },
    redirected: { value: response.redirected },
    type: { value: response.type },
  });
}
