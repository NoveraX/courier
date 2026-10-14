import type { AddressTrust } from "../../adapter/address-trust";

/**
 * The `X-Forwarded-For` a call made on behalf of a request carries
 * upstream, as a page's bundle has it: none, as a page serves no request
 * whose address it could pass on. A bundler that builds for the browser
 * takes this module in place of the one that weighs the proxies in front
 * of a server.
 *
 * @param _request - The request the upstream call is made for
 * @returns Nothing
 * @example
 * ```ts
 * forwardedFor(request); // → undefined
 * ```
 */
export function forwardedFor(_request: Request): string | undefined {
  return undefined;
}

/**
 * The chain of addresses a request came through, as a page's bundle has
 * it: none, as a page serves no request.
 *
 * @param _peer - The address of the connection
 * @param _chain - The `X-Forwarded-For` it came with
 * @param _trust - The proxies trusted
 * @returns Nothing
 * @example
 * ```ts
 * forwardedChain("10.0.0.2", "198.51.100.4"); // → undefined
 * ```
 */
export function forwardedChain(
  _peer: string | undefined,
  _chain: string | null | undefined,
  _trust?: AddressTrust,
): string | undefined {
  return undefined;
}
