/**
 * What a call fails with when a part of the package it needs did not load,
 * on a server or in an app: the failure itself. There the code is on the
 * machine, and a part that does not load is a mistake of how it was
 * deployed, reported as the platform gave it. A page fetches its parts from
 * the server instead, and its bundle takes a stand-in that fails the call
 * as one that reached no server.
 *
 * @param cause - What the load rejected with
 * @returns What the call fails with
 * @example
 * ```ts
 * import("./part").catch((cause: unknown) => {
 *   throw failedLoad(cause);
 * });
 * ```
 */
export function failedLoad(cause: unknown): unknown {
  return cause;
}
