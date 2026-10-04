/*
 * The streams this page opened — reconnects — by the id Studio shows each
 * under, with the run that opened it. Only the socket that started a run
 * may cancel it, so a stream another page or the app itself opened is
 * never offered a stop here.
 */
const opened = new Map<string, string>();

/**
 * Remember a stream this page opened, so it can be stopped from here.
 *
 * @param requestId - The id Studio shows the stream under
 * @param rid - The run that opened it
 * @example
 * ```ts
 * rememberStream(playgroundRequestId(rid), rid);
 * ```
 */
export function rememberStream(requestId: string, rid: string): void {
  opened.set(requestId, rid);
}

/**
 * The run that opened a stream, when this page opened it.
 *
 * @param requestId - The id Studio shows the stream under
 * @returns The run's id, or `undefined` for a stream this page did not open
 * @example
 * ```ts
 * const rid = streamRunOf(request.id);
 * ```
 */
export function streamRunOf(requestId: string): string | undefined {
  return opened.get(requestId);
}

/**
 * Forget a stream once it is stopped.
 *
 * @param requestId - The id Studio shows the stream under
 * @example
 * ```ts
 * forgetStream(request.id);
 * ```
 */
export function forgetStream(requestId: string): void {
  opened.delete(requestId);
}
