import { NetworkError } from "../../errors/network-error";

/**
 * What a page's call fails with when a part of the package it needs did not
 * load: the page asked the server for it and got nothing it could run — a
 * deployment took its chunk away, the connection dropped — so the call
 * fails as one that reached no server does, with a `NetworkError` whose
 * `cause` is the failure, which `onError` is told of and `.safe()` resolves
 * to. A part runs nothing as it loads, so a load that fails is one that did
 * not arrive.
 *
 * @param cause - What the load rejected with
 * @returns A `NetworkError` around it
 * @example
 * ```ts
 * failedLoad(new TypeError("Failed to fetch dynamically imported module")); // a NetworkError
 * ```
 */
export function failedLoad(cause: unknown): unknown {
  return new NetworkError({ cause });
}
