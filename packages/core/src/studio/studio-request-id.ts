/**
 * The header a browser proxy caller names its Studio request id in.
 *
 * An upload's progress is measured in the browser before the proxy has seen
 * the call, so the browser picks the id and the proxy adopts it: the row
 * Studio shows for the call then takes the progress, the proxy's events and
 * the answer alike. The proxy answers with the id it used in `X-Courier-Rid`.
 */
export const STUDIO_REQUEST_HEADER = "x-courier-rid";

/* Long enough to be unique, short and plain enough to be harmless in a log. */
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The Studio request id a call names in its headers, when it is well formed.
 *
 * The header only names the row a call is shown in, and only while Studio
 * is attached; a malformed one is ignored and an id is picked instead.
 *
 * @param headers - The call's headers
 * @returns The id, or `undefined` when the call named none or a malformed one
 * @example
 * ```ts
 * studioRequestIdOf(new Headers({ "x-courier-rid": "up_lx3k2_9f2a1c" }));
 * // → "up_lx3k2_9f2a1c"
 * ```
 */
export function studioRequestIdOf(headers: Headers): string | undefined {
  const id = headers.get(STUDIO_REQUEST_HEADER);
  return id !== null && REQUEST_ID.test(id) ? id : undefined;
}

/**
 * A Studio request id for a call that starts in the browser.
 *
 * Its prefix keeps it apart from the ids a server runtime generates, so a
 * browser's call and a server's never share a row.
 *
 * @returns A fresh id
 * @example
 * ```ts
 * newStudioRequestId(); // → "up_lx3k2vq1_9f2a1c7d"
 * ```
 */
export function newStudioRequestId(): string {
  return `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The header a stream Studio opens through the proxy — a replay, a
 * Playground run — names its row in, so the proxy shows the stream under
 * the id Studio follows rather than one of its own.
 */
export const PLAYGROUND_RID_HEADER = "x-courier-playground-rid";

/**
 * The query parameter a WebSocket Studio opens through the proxy names its
 * row in: a WebSocket's upgrade carries no headers a browser could set.
 */
export const PLAYGROUND_RID_PARAM = "_playground_rid";

/**
 * The row a stream Studio opened asks to be shown under, when the id is
 * well formed; a malformed one is ignored and the stream given an id of
 * its own, as a call's `x-courier-rid` is.
 *
 * @param value - The header's or the parameter's value, if any
 * @returns The id, or `undefined` when there is none or it is malformed
 * @example
 * ```ts
 * playgroundRidOf(request.headers.get(PLAYGROUND_RID_HEADER));
 * ```
 */
export function playgroundRidOf(value: string | null): string | undefined {
  return value !== null && REQUEST_ID.test(value) ? value : undefined;
}
