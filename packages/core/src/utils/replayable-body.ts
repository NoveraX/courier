/**
 * Whether a call's variables can be sent again as the request they make:
 * JSON values, a `FormData` — its files in memory or on disk —, a `Blob`,
 * bytes, `URLSearchParams` and text are read again for each attempt; a
 * stream — an upload passed on as it arrives among them — is read once,
 * by the attempt that sent it. A retry and the second attempt a refreshed
 * token makes ask before they send a call again.
 *
 * @param variables - The call's variables, as its middleware leave them
 * @returns Whether another attempt can send the same body
 * @example
 * ```ts
 * isReplayableBody({ name: "Ada" }); // → true
 * isReplayableBody(file.stream()); // → false
 * ```
 */
export function isReplayableBody(variables: unknown): boolean {
  return typeof ReadableStream === "undefined" || !(variables instanceof ReadableStream);
}
