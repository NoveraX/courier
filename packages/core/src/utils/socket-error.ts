/**
 * The error a WebSocket `error` event is about.
 *
 * `ws` and the browser report a socket error as an `ErrorEvent` whose
 * `error` holds the actual error, and handing on the event itself gave a
 * hook an object that printed as `[object Object]`. An event carrying no
 * error — the browser's plain `Event` — becomes one with its message.
 *
 * @param event - What the socket's `error` listener received
 * @returns The error it carries, or one describing it
 *
 * @example
 * ws.addEventListener("error", (event) => onError(socketError(event)));
 * // RangeError: Max payload size exceeded
 */
export function socketError(event: unknown): Error {
  if (event instanceof Error) return event;
  if (typeof event !== "object" || event === null) return new Error("WebSocket error");
  const error = "error" in event ? event.error : undefined;
  const message = "message" in event ? event.message : undefined;
  if (error instanceof Error) return error;
  return new Error(typeof message === "string" && message ? message : "WebSocket error");
}
